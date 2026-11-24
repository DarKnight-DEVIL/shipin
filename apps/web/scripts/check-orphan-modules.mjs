#!/usr/bin/env node
/**
 * Fail when a source module has no importer.
 *
 * Dead modules are invisible in review: they keep compiling, keep their tests
 * green, and only show up when someone counts lines. About 1,600 lines were
 * removed this way. This check makes the next one fail instead of accumulating.
 *
 * Deliberately not scanned as candidates:
 *   - `src/app/**`: Next.js routes, layouts and colocated route files are
 *     entry points the framework loads by convention, not by import.
 *   - `*.test.*`, `src/test/**`: tests are entry points for Vitest.
 *   - `*.d.ts`, `src/types/**`: type-only declarations.
 *   - root instrumentation / proxy / Sentry configs: framework entry points.
 *
 * Importers are found by the module's basename in a static import, dynamic
 * import, `require`, or `vi.mock` specifier anywhere under `src/`, plus root
 * configs. Test files do NOT count: a module imported only by its own test has
 * no production caller, which is exactly the dead code this check exists for.
 * Test fixtures are listed in the allowlist.
 *
 * Usage: node scripts/check-orphan-modules.mjs [--allowlist <file>]
 * The allowlist is a JSON array of repo-relative paths that are known entry
 * points (for example a file another tool loads by name). Keep it short.
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SRC = path.join(ROOT, "src");
const DEFAULT_ALLOWLIST = path.join(ROOT, "scripts", "orphan-modules-allowlist.json");

const CANDIDATE_EXTENSIONS = new Set([".ts", ".tsx"]);
const ENTRY_BASENAMES = new Set([
  "instrumentation",
  "instrumentation-client",
  "proxy",
  "middleware",
]);

function parseArgs(argv) {
  let allowlist = DEFAULT_ALLOWLIST;
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--allowlist") allowlist = path.resolve(ROOT, argv[++i]);
  }
  return { allowlist };
}

function walk(dir, found = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, found);
    else found.push(full);
  }
  return found;
}

function isCandidate(file) {
  const relative = path.relative(ROOT, file).split(path.sep).join("/");
  if (!CANDIDATE_EXTENSIONS.has(path.extname(file))) return false;
  if (relative.startsWith("src/app/")) return false;
  if (relative.startsWith("src/test/")) return false;
  if (relative.startsWith("src/types/")) return false;
  if (/\.(test|spec)\.[jt]sx?$/.test(relative)) return false;
  if (/\.d\.ts$/.test(relative)) return false;
  if (ENTRY_BASENAMES.has(path.basename(file, path.extname(file)))) return false;
  return true;
}

function moduleNames(file) {
  const base = path.basename(file, path.extname(file));
  const names = [base];

  // `folder/index.ts` is imported as `…/folder`.
  if (base === "index") names.push(path.basename(path.dirname(file)));

  return names;
}

function importerPatterns(names) {
  return names.map(
    (name) =>
      new RegExp(
        `(?:from\\s*|import\\s*\\(\\s*|require\\s*\\(\\s*|vi\\.(?:mock|doMock)\\s*\\(\\s*)["'][^"']*/${name.replace(
          /[.*+?^${}()|[\]\\]/g,
          "\\$&"
        )}["']`
      )
  );
}

function main() {
  const { allowlist: allowlistFile } = parseArgs(process.argv.slice(2));

  const files = walk(SRC).filter((file) => CANDIDATE_EXTENSIONS.has(path.extname(file)));
  const sources = new Map(files.map((file) => [file, readFileSync(file, "utf8")]));

  const extraImporters = [
    path.join(ROOT, "sentry.server.config.ts"),
    path.join(ROOT, "sentry.edge.config.ts"),
    path.join(ROOT, "sentry.client.config.ts"),
  ].filter((file) => {
    try {
      return readFileSync(file, "utf8");
    } catch {
      return false;
    }
  });

  const allowed = new Set();
  try {
    for (const entry of JSON.parse(readFileSync(allowlistFile, "utf8"))) {
      allowed.add(entry);
    }
  } catch {
    // No allowlist is the normal case.
  }

  const orphans = [];

  for (const file of files) {
    if (!isCandidate(file)) continue;

    const relative = path.relative(ROOT, file).split(path.sep).join("/");
    if (allowed.has(relative)) continue;

    const patterns = importerPatterns(moduleNames(file));

    const imported = [...sources.entries()].some(([other, source]) => {
      if (other === file) return false;
      const importer = path.relative(ROOT, other).split(path.sep).join("/");
      if (/\.(test|spec)\.[jt]sx?$/.test(importer)) return false;
      if (importer.startsWith("src/test/")) return false;
      return patterns.some((pattern) => pattern.test(source));
    });

    if (!imported) {
      // A root config that names the module by hand also keeps it alive.
      const namedInConfig = extraImporters.some((config) =>
        patterns.some((pattern) => pattern.test(config))
      );
      if (!namedInConfig) orphans.push(relative);
    }
  }

  if (orphans.length > 0) {
    process.stderr.write(
      `Found ${orphans.length} module(s) with no importer:\n` +
        orphans.map((file) => `  ${file}`).join("\n") +
        `\n\nDelete them, import them, or add a justified entry to ${path.relative(
          ROOT,
          allowlistFile
        )}.\n`
    );
    return 1;
  }

  process.stdout.write(
    `All ${files.filter(isCandidate).length} source modules have an importer.\n`
  );
  return 0;
}

try {
  process.exitCode = main();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : error}\n`);
  process.exitCode = 1;
}
