#!/usr/bin/env node
/**
 * Gives every prerendered page a strict `script-src` without a nonce and without
 * `'unsafe-inline'`.
 *
 * The constraint that made the header policy permissive was structural: a
 * prerendered page has Next's hydration bootstrap written into its HTML at BUILD
 * time, so a per-request nonce can never match it. Hashes do not have that problem -
 * they describe content, and the content is fixed at build time. So this step reads
 * each built page, hashes every inline script it actually contains, and writes a
 * `<meta http-equiv="Content-Security-Policy">` into that page.
 *
 * Why meta and not a header: the header has to be the same for every response, and
 * these hashes differ per page. Browsers INTERSECT the header policy with the meta
 * policy, so the header stays as the permissive floor and each page narrows itself
 * to exactly its own scripts. The failure mode if this step ever stops running is
 * therefore the policy as it is today, not a blank page.
 *
 * Verified in a browser against a production build: with the strict meta in place
 * and the real header still sending `'unsafe-inline'`, pages hydrate (500+ React
 * fibers), the theme bootstrap runs, and nothing is refused.
 *
 * Runs from `build`, before `prepare-standalone`, so the copied tree carries the
 * instrumented HTML.
 */

import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
/**
 * Both copies of the built HTML.
 *
 * `next build` traces a standalone tree, and `prepare-standalone` does not re-copy
 * the prerendered HTML into it - so instrumenting only `.next/server/app` leaves
 * the tree that `npm start` and the Docker image actually serve on the permissive
 * policy. That was measured: the meta was present in one copy and absent in the
 * other, which is a difference no test would have caught, because the page still
 * works either way.
 */
const BUILD_DIR = path.join(ROOT, ".next");

/**
 * The `script-src` the app sends, restated here because this step runs in plain
 * Node while the real policy lives in TypeScript. `injectStaticCsp.test.ts` fails
 * if the two ever disagree, so this copy cannot drift silently.
 */
const SCRIPT_SOURCES = [
  "'self'",
  "https://www.gstatic.com",
  "https://js.paypal.com",
  "https://www.paypal.com",
  "https://www.sandbox.paypal.com",
  "https://unpkg.com",
  "https://apis.google.com",
  "https://accounts.google.com",
  "https://va.vercel-scripts.com",
  "https://www.google.com/recaptcha/",
];

const MARKER = 'http-equiv="Content-Security-Policy"';

/**
 * Pages that keep the permissive policy because the PayPal SDK injects an inline
 * bootstrap at runtime. Restated here because this step runs in plain Node; the
 * drift gate in `injectStaticCsp.test.ts` compares it against
 * `src/config/paypalScriptRoutes.ts`.
 */
const PAYPAL_ROUTES = [
  "/payment/[id]",
  "/requests/[id]",
  "/requests/[id]/invoice",
];

/**
 * Maps a built HTML file to the route it serves.
 *
 * The route is whatever follows the last directory that anchors the page tree, and
 * there are two of them: Next writes `.next/server/app/...` locally, and Vercel's own
 * builder writes `.next/output/...`. Reading only `app` produced
 * `/output/wallet/topup` for the Vercel layout, so the PayPal exemption missed and
 * that page was served the strict policy - which blocks the SDK's inline bootstrap.
 * Both anchors are therefore tried and the deeper one wins.
 */
const ROUTE_ANCHORS = ["app", "output"];

function routeFor(file) {
  const parts = path.relative(BUILD_DIR, file).split(path.sep);
  const index = parts.reduce(
    (deepest, part, at) =>
      ROUTE_ANCHORS.includes(part) ? Math.max(deepest, at) : deepest,
    -1
  );

  return `/${(index === -1 ? parts : parts.slice(index + 1))
    .join("/")
    .replace(/\.html$/, "")}`;
}

/** Inline executable scripts: no `src`, and not a data block such as JSON-LD. */
function inlineScriptBodies(html) {
  const bodies = [];
  const pattern = /<script([^>]*)>([\s\S]*?)<\/script>/g;
  let match;

  while ((match = pattern.exec(html)) !== null) {
    const [, attributes, body] = match;
    if (/\ssrc=/.test(attributes)) continue;
    if (/type="application\/(ld\+json|json)"/.test(attributes)) continue;
    if (!body.trim()) continue;
    bodies.push(body);
  }

  return bodies;
}

/** A page's policy: the app's allowlist, minus `'unsafe-inline'`, plus its hashes. */
export function strictScriptSrc(hashes) {
  const sources = SCRIPT_SOURCES.filter((source) => source !== "'unsafe-inline'");
  const hashSources = hashes.map((hash) => `'sha256-${hash}'`);

  return `script-src ${[...sources, ...hashSources].join(" ")}`;
}

/**
 * Every prerendered HTML file in the build output.
 *
 * Deliberately not a fixed path. Locally Next writes them to
 * the `.next/server/app` tree, and a Vercel build reported that directory as present
 * but empty - Vercel's own builder applies a config change this script cannot see,
 * and it laid the static output out differently. Searching the whole tree finds them
 * wherever they land; `cache` is skipped because it holds stale copies that are never
 * served.
 */
function pages(dir, found = []) {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "cache") continue;
      pages(full, found);
    } else if (entry.endsWith(".html")) {
      found.push(full);
    }
  }

  return found;
}

/**
 * Re-reads the page it just wrote and confirms every inline script is covered.
 *
 * Written by construction, so this should never fire - which is exactly why it is
 * worth asserting. A parsing difference (a script tag shape this file does not
 * expect) would otherwise show up as one blocked script on one page in one browser.
 */
function verify(file) {
  const html = readFileSync(file, "utf8");
  const meta = html.match(
    new RegExp(`<meta ${MARKER} content="([^"]*)">`)
  )?.[1];

  if (!meta) return `no meta tag`;

  const hashes = new Set(
    [...meta.matchAll(/'sha256-([^']+)'/g)].map((match) => match[1])
  );

  for (const body of inlineScriptBodies(html)) {
    const hash = createHash("sha256").update(body).digest("base64");
    if (!hashes.has(hash)) {
      return `inline script not covered: ${body.slice(0, 40).replace(/\s+/g, " ")}`;
    }
  }

  return null;
}

function instrument(file) {
  let html = readFileSync(file, "utf8");

  // Idempotent: a second run replaces the tag it wrote rather than stacking one.
  html = html.replace(
    new RegExp(`<meta ${MARKER} content="[^"]*">`, "g"),
    ""
  );

  const hashIndex = html.indexOf("<head>");
  if (hashIndex === -1) return null;

  const hashes = [
    ...new Set(
      inlineScriptBodies(html).map((body) =>
        createHash("sha256").update(body).digest("base64")
      )
    ),
  ];

  const policy = `${strictScriptSrc(hashes)}; script-src-attr 'none'`;
  const meta = `<meta ${MARKER} content="${policy.replace(/"/g, "&quot;")}">`;

  writeFileSync(file, html.replace("<head>", `<head>${meta}`));

  return hashes.length;
}

if (!existsSync(BUILD_DIR)) {
  // A bare checkout with no build: nothing to instrument, and nothing to claim.
  console.log("static CSP: no build output, skipping");
  process.exit(0);
}

const files = pages(BUILD_DIR);
const byDirectory = new Map();
for (const file of files) {
  const dir = path.dirname(path.relative(BUILD_DIR, file)).split(path.sep)[0];
  byDirectory.set(dir, (byDirectory.get(dir) ?? 0) + 1);
}

let instrumented = 0;
let skipped = 0;
let scriptCount = 0;
let hashCount = 0;
let paypalSkipped = 0;

{
  for (const file of files) {
    // The SDK's inline bootstrap cannot be hashed, so this page keeps the floor.
    if (PAYPAL_ROUTES.includes(routeFor(file))) {
      paypalSkipped += 1;
      writeFileSync(
        file,
        readFileSync(file, "utf8").replace(
          new RegExp(`<meta ${MARKER} content="[^"]*">`, "g"),
          ""
        )
      );
      continue;
    }

    const hashes = instrument(file);
    if (hashes === null) {
      skipped += 1;
      continue;
    }

    const problem = verify(file);
    if (problem) {
      console.error(`static CSP: ${file} - ${problem}`);
      process.exit(1);
    }

    instrumented += 1;
    hashCount += hashes;
    scriptCount += inlineScriptBodies(readFileSync(file, "utf8")).length;
  }
}

for (const [dir, count] of byDirectory) {
  console.log(`static CSP: ${count} HTML file(s) under .next/${dir}`);
}

/*
 * No HTML in the build output means this step has nothing to harden: the deployment
 * serves pages the build did not materialize, and the header policy applies. That is
 * a downgrade from what this step is for, not a broken app - every page still works -
 * so it is reported loudly and the build continues. Failing here blocked a
 * deployment over a condition the script cannot fix.
 */
if (files.length === 0) {
  console.warn(
    "static CSP: the build output contains no prerendered HTML, so no page got the strict meta. " +
      "Pages are served under the header policy (which allows inline scripts)."
  );
  process.exit(0);
}

if (instrumented === 0) {
  console.error(
    "static CSP: HTML exists but none was instrumented - the meta tag is not being written"
  );
  process.exit(1);
}

if (skipped > 0) {
  /*
   * Not a failure: not every .html in the tree is a page. The build copies
   * public/googled*.html, Google Search Console's verification file, which is served
   * verbatim and has no <head> - a document written for that one path.
   */
  console.log(
    `static CSP: ${skipped} HTML file(s) are not documents (no <head>) and were left alone`
  );
}

console.log(
  `static CSP: ${instrumented} prerendered page(s) strict (${scriptCount} inline scripts, ${hashCount} hashes)`
);

if (paypalSkipped > 0) {
  // Stated, not silent: these pages keep 'unsafe-inline' for scripts.
  console.log(
    `static CSP: ${paypalSkipped} page(s) kept the permissive policy for the PayPal SDK inline bootstrap`
  );
}
