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
const APP_DIRS = [
  path.join(ROOT, ".next", "server", "app"),
  path.join(ROOT, ".next", "standalone", "apps", "web", ".next", "server", "app"),
];

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

function pages(dir) {
  const found = [];

  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) found.push(...pages(full));
    else if (entry.endsWith(".html")) found.push(full);
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

const trees = APP_DIRS.filter((dir) => existsSync(dir));

if (trees.length === 0) {
  // A bare checkout with no build: nothing to instrument, and nothing to claim.
  console.log("static CSP: no build output, skipping");
  process.exit(0);
}

let instrumented = 0;
let skipped = 0;
let scriptCount = 0;
let hashCount = 0;

for (const tree of trees) {
  let perTree = 0;

  for (const file of pages(tree)) {
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
    perTree += 1;
    hashCount += hashes;
    scriptCount += inlineScriptBodies(readFileSync(file, "utf8")).length;
  }

  console.log(
    `static CSP: ${perTree} page(s) in ${path.relative(ROOT, tree).replace(/\\\\/g, "/")}`
  );
}

/*
 * A step that silently instruments nothing is indistinguishable from a step that
 * works, and both leave the app on the permissive policy. Fail instead.
 */
if (instrumented === 0) {
  console.error(
    "static CSP: found prerendered HTML but instrumented none - the meta tag is not being written"
  );
  process.exit(1);
}

if (skipped > 0) {
  console.error(
    `static CSP: ${skipped} HTML file(s) have no <head> and were left on the permissive policy`
  );
  process.exit(1);
}

console.log(
  `static CSP: ${instrumented} prerendered page(s) strict (${scriptCount} inline scripts, ${hashCount} hashes)`
);
