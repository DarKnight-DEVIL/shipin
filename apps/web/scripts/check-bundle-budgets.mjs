#!/usr/bin/env node
/**
 * Per-route initial JavaScript budget check.
 *
 * Measures the JavaScript every route downloads before it becomes
 * interactive: the chunks referenced by `<script src>` in the prerendered
 * HTML under `.next/server/app`, gzipped at level 9 and summed per route.
 * That is the same measurement the bundle work used by hand, so the numbers
 * printed here match the ones quoted in review and in the docs.
 *
 * Anything the browser fetches later — `next/dynamic` chunks, lazy modals,
 * the Firestore SDK on routes that only touch it behind an interaction — is
 * not initial load and is deliberately not counted.
 *
 * Usage:
 *   node scripts/check-bundle-budgets.mjs            # check (run after `npm run build`)
 *   node scripts/check-bundle-budgets.mjs --update   # rewrite budgets from this build
 *
 * Exits non-zero when any route exceeds its budget, when a prerendered route
 * has no budget entry, or when no routes could be measured at all.
 */
import { gzipSync } from "node:zlib";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const DEFAULT_BUILD_DIR = ".next";
const DEFAULT_BUDGET_FILE = "scripts/bundle-budgets.json";

/**
 * Slack added by `--update`. Budgets are deliberately tight: this much covers
 * incidental churn from a dependency patch, while a real regression — a
 * library pulled into a shared chunk, a form that stops being lazy — is
 * orders of magnitude larger.
 */
const HEADROOM_KB = 3;

/** Framework-generated pages that are not user-facing routes. */
const IGNORED_PREFIX = "_";

function parseArgs(argv) {
  const options = {
    update: false,
    buildDir: DEFAULT_BUILD_DIR,
    budgetFile: DEFAULT_BUDGET_FILE,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--update") options.update = true;
    else if (arg === "--build-dir") options.buildDir = argv[++i];
    else if (arg === "--budget-file") options.budgetFile = argv[++i];
    else if (arg === "--help" || arg === "-h") options.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

function usage() {
  return [
    "Usage: node scripts/check-bundle-budgets.mjs [options]",
    "",
    "  --update              rewrite the budget file from the current build",
    "  --build-dir <dir>     Next.js output directory (default: .next)",
    "  --budget-file <file>  budget file (default: scripts/bundle-budgets.json)",
  ].join("\n");
}

function walkHtml(dir, found = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkHtml(full, found);
    else if (entry.name.endsWith(".html")) found.push(full);
  }
  return found;
}

/** `requests/new.html` → `/requests/new`, `index.html` → `/`. */
/**
 * Chunk files a dynamic route loads before hydration.
 *
 * Dynamic routes never produce HTML, so the `<script src>` walk cannot see
 * them. The route's own build manifest contributes the framework and polyfill
 * chunks, and its client-reference manifest lists the chunks for every
 * synchronously referenced client module — including the page itself. Async
 * chunks (next/dynamic, lazy modals) are excluded, matching the static
 * measurement's "initial load only" policy.
 */
function dynamicChunks(buildDir, pageDir) {
  let buildManifest;
  try {
    buildManifest = JSON.parse(
      readFileSync(path.join(pageDir, "build-manifest.json"), "utf8")
    );
  } catch {
    return null;
  }

  const files = new Set([
    ...(buildManifest.rootMainFiles ?? []),
    ...(buildManifest.polyfillFiles ?? []),
  ]);

  const referenceFile = readdirSync(pageDir).find((name) =>
    name.endsWith("_client-reference-manifest.js")
  );

  if (referenceFile) {
    const source = readFileSync(path.join(pageDir, referenceFile), "utf8");
    // The manifest is `globalThis.__RSC_MANIFEST["…"] = { … };`.
    const start = source.indexOf("] = {");

    if (start !== -1) {
      try {
        const manifest = JSON.parse(
          source.slice(start + 4).trim().replace(/;\s*$/, "")
        );

        for (const module of Object.values(manifest.clientModules ?? {})) {
          if (module.async) continue;
          for (const chunk of module.chunks ?? []) {
            files.add(chunk.replace(/^\/_next\//, ""));
          }
        }
      } catch {
        // A manifest Next changes shape on: keep the framework chunks.
      }
    }
  }

  return [...files].map((file) => path.join(buildDir, file));
}

/** `.next/server/app/(platform)/requests/[id]/page` → `/requests/[id]`. */
function routeForPageDir(pageDir, appDir) {
  const route = path
    .relative(appDir, pageDir)
    .split(path.sep)
    .join("/")
    .split("/")
    .filter((segment) => !/^\(.+\)$/.test(segment))
    .join("/");

  return route ? `/${route}` : "/";
}

/** Every `…/page/build-manifest.json` Next emitted for a dynamic route. */
function dynamicRouteManifests(appDir) {
  const manifests = [];

  function walk(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (
        entry.name === "build-manifest.json" &&
        path.basename(dir) === "page"
      ) {
        manifests.push({ pageDir: path.dirname(dir), file: full });
      }
    }
  }

  walk(appDir);
  return manifests;
}

function routeFor(htmlFile, appDir) {
  const rel = path
    .relative(appDir, htmlFile)
    .split(path.sep)
    .join("/")
    .replace(/\.html$/, "");
  if (rel === "index") return "/";
  return `/${rel}`;
}

function scriptSrcs(html) {
  const matches = html.matchAll(/<script[^>]+src="([^"]+)"/g);
  const srcs = new Set();
  for (const match of matches) {
    const src = match[1];
    if (src.includes("/_next/static/") && src.endsWith(".js")) srcs.add(src);
  }
  return [...srcs];
}

function chunkPath(buildDir, src) {
  const clean = src.replace(/^\/_next\//, "").split("?")[0];
  return path.join(buildDir, clean);
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(`${usage()}\n`);
    return 0;
  }

  const appDir = path.join(options.buildDir, "server", "app");
  let htmlFiles;
  try {
    htmlFiles = walkHtml(appDir);
  } catch {
    process.stderr.write(
      `No prerendered HTML under ${appDir}. Run \`npm run build\` first.\n`
    );
    return 1;
  }

  const gzipCache = new Map();
  function gzipSize(file) {
    if (!gzipCache.has(file)) {
      let size = 0;
      try {
        size = gzipSync(readFileSync(file), { level: 9 }).length;
      } catch {
        size = -1;
      }
      gzipCache.set(file, size);
    }
    return gzipCache.get(file);
  }

  const measured = new Map();
  const missingChunks = new Set();
  let ignoredRoutes = 0;
  let dynamicRoutes = 0;

  for (const htmlFile of htmlFiles) {
    const route = routeFor(htmlFile, appDir);
    if (path.posix.basename(route).startsWith(IGNORED_PREFIX)) {
      ignoredRoutes += 1;
      continue;
    }

    let bytes = 0;
    for (const src of scriptSrcs(readFileSync(htmlFile, "utf8"))) {
      const file = chunkPath(options.buildDir, src);
      const size = gzipSize(file);
      if (size < 0) missingChunks.add(path.basename(file));
      else bytes += size;
    }
    measured.set(route, bytes);
  }

  /*
   * Dynamic routes are measured from the chunk group Next bootstraps for them.
   * A route that did prerender keeps its HTML measurement instead.
   */
  for (const { pageDir, file } of dynamicRouteManifests(appDir)) {
    const route = routeForPageDir(pageDir, appDir);
    if (route.startsWith("/api") || measured.has(route)) continue;

    const chunks = dynamicChunks(options.buildDir, path.dirname(file));
    if (!chunks) continue;

    let bytes = 0;
    for (const chunk of chunks) {
      const size = gzipSize(chunk);
      if (size < 0) missingChunks.add(path.basename(chunk));
      else bytes += size;
    }

    measured.set(route, bytes);
    dynamicRoutes += 1;
  }

  if (measured.size === 0) {
    process.stderr.write(
      `Found no measureable routes under ${appDir}; nothing was checked.\n`
    );
    return 1;
  }

  const routes = [...measured.keys()].sort();

  if (options.update) {
    const budgets = {};
    for (const route of routes) {
      budgets[route] = Math.ceil(measured.get(route) / 1024) + HEADROOM_KB;
    }
    writeFileSync(
      options.budgetFile,
      `${JSON.stringify(budgets, null, 2)}\n`,
      "utf8"
    );
    process.stdout.write(
      `Wrote ${routes.length} budgets to ${options.budgetFile} ` +
        `(measured + ${HEADROOM_KB} KB).\n`
    );
    return 0;
  }

  let budgetFile;
  try {
    budgetFile = JSON.parse(readFileSync(options.budgetFile, "utf8"));
  } catch (error) {
    process.stderr.write(
      `Could not read budgets from ${options.budgetFile}: ${error.message}\n` +
        `Create one with --update after a build.\n`
    );
    return 1;
  }

  const failures = [];
  const unbudgeted = [];

  process.stdout.write(
    `${"route".padEnd(28)}${"actual".padStart(8)}${"budget".padStart(8)}${"delta".padStart(8)}  status\n`
  );

  for (const route of routes) {
    const actualKb = Math.ceil(measured.get(route) / 1024);
    const budgetKb = budgetFile[route];

    if (typeof budgetKb !== "number") {
      unbudgeted.push(route);
      process.stdout.write(
        `${route.padEnd(28)}${`${actualKb} KB`.padStart(8)}${"–".padStart(8)}${"–".padStart(8)}  no budget\n`
      );
      continue;
    }

    const delta = actualKb - budgetKb;
    const over = delta > 0;
    if (over) failures.push({ route, actualKb, budgetKb, delta });
    process.stdout.write(
      `${route.padEnd(28)}${`${actualKb} KB`.padStart(8)}${`${budgetKb} KB`.padStart(8)}` +
        `${`${delta > 0 ? "+" : ""}${delta} KB`.padStart(8)}  ${over ? "OVER" : "ok"}\n`
    );
  }

  // A budgeted route that produced no HTML is either dynamic now or failed to
  // prerender. Neither is a budget violation, but both silently shrink the
  // coverage of this check, so say so rather than passing quietly.
  const unmeasured = Object.keys(budgetFile).filter(
    (route) => !measured.has(route)
  );
  if (unmeasured.length > 0) {
    process.stdout.write(
      `\nNote: ${unmeasured.length} budgeted route(s) were not prerendered in ` +
        `this build and could not be measured: ${unmeasured.join(", ")}.\n`
    );
  }

  if (missingChunks.size > 0) {
    process.stdout.write(
      `\nWarning: ${missingChunks.size} referenced chunk(s) were not on disk ` +
        `(${[...missingChunks].slice(0, 5).join(", ")}). HTML may be from an older build.\n`
    );
  }
  if (ignoredRoutes > 0) {
    process.stdout.write(`Skipped ${ignoredRoutes} framework page(s).\n`);
  }
  if (dynamicRoutes > 0) {
    process.stdout.write(
      `Measured ${dynamicRoutes} dynamic route(s) from their bootstrap chunks.\n`
    );
  }

  if (unbudgeted.length > 0) {
    process.stderr.write(
      `\nNo budget for ${unbudgeted.length} route(s): ${unbudgeted.join(", ")}\n` +
        `Add them to ${options.budgetFile} with --update once you have reviewed the size.\n`
    );
  }

  if (failures.length > 0) {
    process.stderr.write(`\n${failures.length} route(s) over budget:\n`);
    for (const failure of failures) {
      process.stderr.write(
        `  ${failure.route}: ${failure.actualKb} KB, budget ${failure.budgetKb} KB (+${failure.delta} KB)\n`
      );
    }
  }

  if (failures.length > 0 || unbudgeted.length > 0) return 1;

  process.stdout.write(`\nAll ${routes.length} routes within budget.\n`);
  return 0;
}

try {
  process.exitCode = main();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : error}\n`);
  process.exitCode = 1;
}
