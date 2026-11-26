#!/usr/bin/env node
/**
 * Writes `src/config/dynamicRoutes.generated.ts`: the app routes the build did not
 * prerender.
 *
 * The CSP nonce may only be applied to pages rendered per request. A prerendered
 * page has its inline bootstrap baked into the HTML at build time, so a nonce
 * generated when that file is served could never match it - attaching one blocks
 * the scripts that hydrate the page.
 *
 * Which routes those are is a fact about the build, so it is read from the build
 * rather than assumed:
 *
 *   .next/app-path-routes-manifest.json  every page route that exists
 *   .next/prerender-manifest.json        the ones that were prerendered
 *
 * The difference is the dynamic set. `prerender-manifest.dynamicRoutes` is NOT
 * enough: it lists parameterised patterns like `/requests/[id]`, and a page marked
 * `force-dynamic` appears in neither list there.
 *
 * Runs from `build`, after `next build`. Without a build (a bare test checkout) it
 * writes an empty list, which is also the correct default: no nonce anywhere.
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const NEXT_DIR = path.join(ROOT, ".next");
const PATH_ROUTES = path.join(NEXT_DIR, "app-path-routes-manifest.json");
const PRERENDER = path.join(NEXT_DIR, "prerender-manifest.json");
const OUTPUT = path.join(ROOT, "src", "config", "dynamicRoutes.generated.ts");

function readJson(file) {
  return existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : null;
}

/**
 * Every route the build prerendered, exactly.
 *
 * Needed because a pattern over-claims: `/requests/[id]` is dynamic, and
 * `/requests/new` happens to satisfy it, but `/requests/new` is prerendered and has
 * its own HTML. The static route wins at the router, so it has to win here too.
 */
function readPrerenderedRoutes() {
  const prerender = readJson(PRERENDER);
  if (!prerender) return [];

  return Object.keys(prerender.routes ?? {})
    .filter((route) => route.startsWith("/") && !route.startsWith("/_"))
    .sort();
}

/** Route patterns the build renders on demand, matched segment by segment. */
function readDynamicRoutes() {
  const pathRoutes = readJson(PATH_ROUTES);
  const prerender = readJson(PRERENDER);
  if (!pathRoutes || !prerender) return [];

  const prerendered = new Set(Object.keys(prerender.routes ?? {}));
  const dynamic = new Set();

  for (const [appPath, routePath] of Object.entries(pathRoutes)) {
    // Only pages: layouts, route handlers and error boundaries have no route.
    if (!appPath.endsWith("/page") && appPath !== "page") continue;

    if (prerendered.has(routePath)) continue;

    const route = String(routePath);

    // `/_global-error` and `/_not-found` are internal and never served by URL.
    if (!route.startsWith("/") || route.startsWith("/_") || route === "") {
      continue;
    }

    /*
     * The full pattern, not its literal prefix. `/requests/[id]` is dynamic while
     * `/requests` - the list page - is prerendered, so collapsing to the prefix
     * would hand the list page a nonce and break it.
     */
    dynamic.add(route);
  }

  return [...dynamic].sort();
}

/**
 * Hashes for inline scripts that are NOT Next's own bootstrap.
 *
 * Next stamps its bootstrap tags with the request's nonce, but an inline script a
 * library injects through normal JSX (next-themes' pre-paint theme bootstrap is the
 * one here) is not Next's to stamp. Without an allowance it is blocked the moment
 * `'unsafe-inline'` goes, and the visible result is a light flash for anyone using
 * dark mode.
 *
 * So the build hashes them: a `'sha256-...'` source is accepted without a nonce and
 * without `'unsafe-inline'`. Only scripts that appear byte-identically in two or
 * more prerendered pages qualify - that is what makes them a shared bootstrap
 * rather than one page's content. A script whose content changes with the data on
 * the page must never be hashed here, because the hash would then be wrong for
 * every other page.
 */
function readSharedInlineScriptHashes() {
  const appDir = path.join(NEXT_DIR, "server", "app");
  if (!existsSync(appDir)) return [];

  const pages = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      const full = path.join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (entry.endsWith(".html")) pages.push(full);
    }
  };
  walk(appDir);

  const seenIn = new Map();
  for (const page of pages.slice(0, 40)) {
    const html = readFileSync(page, "utf8");
    const bodies = new Set(
      [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1])
    );

    for (const body of bodies) {
      const hash = createHash("sha256").update(body).digest("base64");
      seenIn.set(hash, (seenIn.get(hash) ?? 0) + 1);
    }
  }

  return [...seenIn.entries()]
    .filter(([, pages]) => pages >= 2)
    .map(([hash]) => hash)
    .sort();
}

const routes = readDynamicRoutes();
const prerenderedExact = readPrerenderedRoutes();
const sharedInlineScriptHashes = readSharedInlineScriptHashes();

const file = `/**
 * GENERATED FILE - do not edit.
 *
 * App routes the build did not prerender, from \`scripts/generate-dynamic-routes.mjs\`
 * (wired into \`build\`). Only these may receive a per-request CSP nonce: a
 * prerendered page has its inline scripts baked in, so a nonce generated when its
 * HTML is served could never match them.
 *
 * Empty means every route is prerendered - the correct state for this app today,
 * not a missing mechanism. When a page starts using cookies()/headers(), or is
 * marked \`force-dynamic\`, it appears here on the next build and gets the tighter
 * policy automatically.
 */
export const DYNAMIC_APP_ROUTES: readonly string[] = ${JSON.stringify(routes, null, 2)};

/**
 * Routes with prerendered HTML of their own. An exact match here always wins over a
 * dynamic pattern: \`/requests/new\` is a static page even though \`/requests/[id]\`
 * would also match it.
 */
export const PRERENDERED_APP_ROUTES: readonly string[] = ${JSON.stringify(prerenderedExact, null, 2)};

/**
 * \`sha256-\` hashes of inline scripts shared by every prerendered page (the theme
 * bootstrap). Each is an allowance that survives dropping \`'unsafe-inline'\`, for
 * scripts Next does not stamp with the request nonce.
 */
export const SHARED_INLINE_SCRIPT_HASHES: readonly string[] = ${JSON.stringify(sharedInlineScriptHashes, null, 2)};
`;

/** Reads one `export const NAME` array back out of the previously written file. */
function readArray(source, name) {
  const match = source?.match(
    new RegExp(`export const ${name}: readonly string\\[\\] = (\\[[\\s\\S]*?\\]);`)
  );
  if (!match) return null;

  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

const previous = existsSync(OUTPUT) ? readFileSync(OUTPUT, "utf8") : null;
writeFileSync(OUTPUT, file);

const summary = `${routes.length} route(s)${routes.length ? ` (${routes.join(", ")})` : ""}`;

/*
 * Only ONE of the three arrays is a decision this file can gate on.
 *
 * `DYNAMIC_APP_ROUTES` is semantic: it says which routes are rendered on demand, it
 * comes from the source tree, and it is identical on every machine. If it changed,
 * the proxy in this build compiled against the previous answer - a route that just
 * became prerendered would still get a per-request nonce and lose the scripts baked
 * into its HTML. That is the dangerous direction, so the build stops.
 *
 * The other two are facts about THIS machine's build output. `PRERENDERED_APP_ROUTES`
 * follows whatever Next decided to prerender here, and the hashes are of bytes this
 * build emitted. CI and a laptop legitimately disagree, and failing on that - which
 * is what this gate did on the first Vercel deploy - blocks every deploy for a
 * difference that does not change behaviour.
 */
const previousRoutes = readArray(previous, "DYNAMIC_APP_ROUTES");
const routeDrift =
  previousRoutes !== null &&
  JSON.stringify(previousRoutes) !== JSON.stringify(routes);
const otherDrift = previous !== null && previous !== file && !routeDrift;

if (routeDrift && !process.env.DYNAMIC_ROUTES_ACCEPT_DRIFT) {
  console.error(
    `dynamic routes changed: ${summary}.\n` +
      `src/config/dynamicRoutes.generated.ts was rewritten - commit it and rebuild.\n` +
      `A build compiled with the previous list would apply a CSP nonce to a route ` +
      `that no longer qualifies, blocking that page's own scripts.`
  );
  process.exit(1);
}

if (otherDrift) {
  // Expected on a different machine. The file is rewritten so the injector, which
  // runs after this, works from this build's own output.
  console.log(
    `dynamic routes unchanged (${summary}); this build's prerender set and inline-script ` +
      `hashes were refreshed - they describe build output, not source, so they differ ` +
      `between machines.`
  );
  process.exit(0);
}

console.log(`dynamic route manifest: ${summary}`);
