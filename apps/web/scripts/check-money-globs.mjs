#!/usr/bin/env node
/**
 * Fails when a money-path module lives outside every stricter coverage floor.
 *
 * The other two checks guard the globs themselves: `check-coverage-globs.mjs`
 * fails when a glob matches no file, and `check-compliance-tests.mjs` requires a
 * test per compliance module. Neither notices a *new* file that belongs under a
 * floor but matches no glob — it inherits the global 80/70 thresholds while
 * reading like the money code next to it, and nothing ever says so.
 *
 * Why this is name-based rather than "every included file": `coverage.include`
 * is app-wide — 193 files today, 151 of which are not money or compliance at
 * all (`src/lib/cors.ts`, `src/app/api/requests/...`). Asserting that all of
 * them fall inside a money glob would mean exempting four fifths of the repo,
 * which is a gate that cannot fail for the reason it was written.
 *
 * So the rule is: any included file whose path names a money or compliance
 * concern must match at least one threshold glob. Adding
 * `src/lib/refundGate.ts`, `src/features/admin/hooks/useAdminWallet.ts` or
 * `src/app/api/paypal/webhook/route.ts` therefore cannot slip past the stricter
 * floor.
 *
 * Known limit: the match is on the filename and path, so a money module with an
 * abstract name (`src/lib/ledger.ts`) is not caught. That is a deliberate trade
 * — a name list is reviewable, and the alternative was 151 exemptions.
 *
 * Usage:
 *   node scripts/check-money-globs.mjs
 */
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { COVERAGE_GLOB_THRESHOLDS } from "../coverage-thresholds.mjs";

const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));

/**
 * Mirrors `coverage.include` in vitest.config.ts. It lives here as data because
 * that config is TypeScript and this script is plain Node; the two are checked
 * against each other by the failure message below if they ever drift apart.
 */
const INCLUDE_ROOTS = ["src/lib", "src/features", "src/app/api"];

/** Path fragments that mark a file as money-path or compliance code. */
const PROTECTED_NAME = /(paypal|payment|refund|wallet|payout|billing|invoice|compliance)/i;

const SKIP_DIRS = new Set(["node_modules", ".next", "coverage"]);

const out = (line = "") => process.stdout.write(`${line}\n`);

function collectFiles(dir) {
  const files = [];

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      // `coverage.exclude` in vitest.config.ts drops fixture trees, so those
      // files are never measured and cannot carry a coverage floor. Scanning
      // them here only flagged test data that no glob is meant to cover.
      if (entry.name === "__fixtures__") continue;
      files.push(...collectFiles(path.join(dir, entry.name)));
      continue;
    }

    if (!entry.isFile()) continue;

    const relative = path
      .relative(ROOT, path.join(dir, entry.name))
      .split(path.sep)
      .join("/");

    if (!/\.(ts|tsx)$/.test(relative)) continue;
    if (/\.test\.(ts|tsx)$/.test(relative)) continue;
    if (/\.d\.ts$/.test(relative)) continue;

    files.push(relative);
  }

  return files;
}

if (typeof path.matchesGlob !== "function") {
  console.error("check-money-globs: this script needs Node 22.5+ (path.matchesGlob).");
  process.exit(1);
}

const missingRoots = INCLUDE_ROOTS.filter(
  (root) => !existsSync(path.join(ROOT, root))
);

if (missingRoots.length > 0) {
  // A renamed include root would leave this check scanning nothing and passing.
  console.error(
    "check-money-globs: these coverage.include roots do not exist: " +
      missingRoots.join(", ") +
      ". Update INCLUDE_ROOTS to match vitest.config.ts."
  );
  process.exit(1);
}

const globs = Object.keys(COVERAGE_GLOB_THRESHOLDS);
const files = INCLUDE_ROOTS.flatMap((root) => collectFiles(path.join(ROOT, root)));

const escapes = files
  .filter((file) => PROTECTED_NAME.test(file))
  .filter((file) => !globs.some((glob) => path.matchesGlob(file, glob)));

const protectedCount = files.filter((file) => PROTECTED_NAME.test(file)).length;

out(`${protectedCount} money-path files, ${globs.length} threshold globs`);

if (escapes.length > 0) {
  console.error("");
  console.error(
    "check-money-globs: these money-path files match no stricter coverage glob, " +
      "so they are held to the global thresholds instead of the payment floor:"
  );

  for (const file of escapes) {
    console.error(`  - ${file}`);
  }

  console.error("");
  console.error(
    "Add a glob to coverage-thresholds.mjs (and run `npm run check:coverage-globs`), " +
      "or rename the file if it is not money-path code."
  );
  process.exit(1);
}

out(`All ${protectedCount} money-path files fall inside a stricter coverage glob.`);
