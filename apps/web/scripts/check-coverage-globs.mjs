#!/usr/bin/env node
//
// Fails when a coverage threshold glob matches no file.
//
// Vitest checks each glob-keyed threshold against the files that glob resolves
// to. When it resolves to nothing, the threshold has nothing to measure and is
// skipped — silently. Renaming `src/features/wallet` or mistyping
// `src/app/api/payment/**` therefore removes a money-path gate while the run
// stays green, and nothing in the coverage report says so.
//
// This script reads the exact same glob keys the config uses (they share
// `coverage-thresholds.mjs`), resolves each against the tracked source tree,
// and exits non-zero if any glob matches nothing.
//
// It also validates the floor *values*, which Vitest does not police: a family
// floor above 100 can never be met, one below the global minimum enforces
// nothing extra while reading like a stricter gate, and an unknown metric key
// (`brnaches`) is ignored outright — leaving a family that looks gated and is
// not.
//
// Usage:
//   node scripts/check-coverage-globs.mjs
//
// Matching uses `path.matchesGlob` (Node 22.5+), so the check reads globs the
// same way Node does rather than re-implementing a matcher.
//
"use strict";
import { readdirSync } from "node:fs";
import {
  COVERAGE_GLOB_THRESHOLDS,
  COVERAGE_METRICS,
  GLOBAL_COVERAGE_FLOORS,
  PACKAGES_GLOBAL_FLOORS,
} from "../coverage-thresholds.mjs";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

//
// Resolve the project root. The script lives at apps/web/scripts/ and the
// project root (containing package.json, apps/, packages/) is three levels
// up. We go up from the script file path until we reach the project root.
//
const scriptPath = path.resolve(fileURLToPath(new URL(import.meta.url)));
let ROOT = scriptPath;
// Walk up 3 levels: script → scripts → web → shipin (project root)
for (let i = 0; i < 3; i++) {
  ROOT = path.dirname(ROOT);
}
// Safety check: if package.json isn't at ROOT, keep walking up
while (!existsSync(path.join(ROOT, "package.json"))) {
  const parent = path.dirname(ROOT);
  if (parent === ROOT) break; // reached filesystem root
  ROOT = parent;
}

//
// Directories that never contain covered source.
//
const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  ".next",
  "coverage",
  "playwright-report",
  "test-results",
]);

//
// Walk src/ and return repo-relative POSIX paths starting from src/.
//
// Coverage itself runs over src/, and thresholds apply to production files
// only, so test suites and docs are filtered out here too — a glob that only
// matches route.test.ts or a README is just as dead as one that matches
// nothing at all.
//
function collectSourceFilesFromDir(dir) {
  const files = [];

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      files.push(...collectSourceFilesFromDir(path.join(dir, entry.name)));
      continue;
    }

    if (!entry.isFile()) continue;

    let relative = path
      .relative(ROOT, path.join(dir, entry.name))
      .split(path.sep)
      .join("/");

    // Strip apps/web/ prefix so paths start from src/ to match config globs
    if (relative.startsWith("apps/web/")) {
      relative = relative.slice("apps/web/".length);
    }

    if (/\.test\.(ts|tsx)$/.test(relative)) continue;
    if (relative.endsWith("README.md")) continue;

    files.push(relative);
  }

  return files;
}

//
// Collect source files from both apps/web/src and packages/*/src.
//
function collectSourceFiles() {
  const files = [];
  // Collect from apps/web/src
  const webSrc = path.join(ROOT, "apps", "web", "src");
  if (existsSync(webSrc)) {
    files.push(...collectSourceFilesFromDir(webSrc));
  }
  // Also include packages
  const packagesDir = path.join(ROOT, "packages");
  if (existsSync(packagesDir)) {
    for (const pkg of readdirSync(packagesDir)) {
      const pkgSrc = path.join(packagesDir, pkg, "src");
      try {
        files.push(...collectSourceFilesFromDir(pkgSrc));
      } catch (e) {
        // some packages may not have src dirs
      }
    }
  }
  return files;
}

if (typeof path.matchesGlob !== "function") {
  console.error(
    "check-coverage-globs: this script needs Node 22.5+ (path.matchesGlob)."
  );
  process.exit(1);
}

//
// Problems with the configured numbers themselves.
//
function validateFloors() {
  const problems = [];

  for (const [metric, floor] of Object.entries(GLOBAL_COVERAGE_FLOORS)) {
    if (!Number.isFinite(floor) || floor < 0 || floor > 100) {
      problems.push(
        `global ${metric} floor ${String(floor)} is not a percentage between 0 and 100`
      );
    }
  }

  for (const [glob, floors] of Object.entries(COVERAGE_GLOB_THRESHOLDS)) {
    const entries = Object.entries(floors);

    if (entries.length === 0) {
      problems.push(`${glob}: no floors configured`);
      continue;
    }

    for (const [metric, value] of entries) {
      if (!COVERAGE_METRICS.includes(metric)) {
        problems.push(
          `${glob}: unknown metric "${metric}" (Vitest ignores it, so that floor is absent)`
        );
        continue;
      }

      if (typeof value !== "number" || !Number.isFinite(value)) {
        problems.push(
          `${glob}: ${metric} floor ${String(value)} is not a number`
        );
        continue;
      }

      if (value > 100) {
        problems.push(
          `${glob}: ${metric} floor ${value}% is above 100%, which can never pass`
        );
      }

      if (value < GLOBAL_COVERAGE_FLOORS[metric]) {
        problems.push(
          `${glob}: ${metric} floor ${value}% is below the global ` +
            `${GLOBAL_COVERAGE_FLOORS[metric]}% — a family floor must be at least as strict`
        );
      }
    }
  }

  return problems;
}

const floorProblems = validateFloors();

if (floorProblems.length > 0) {
  console.error("");
  console.error("check-coverage-globs: the configured floors are not usable:");

  for (const problem of floorProblems) {
    console.error(`  - ${problem}`);
  }

  console.error("");
  console.error(
    "Fix apps/web/coverage-thresholds.mjs. A floor that cannot pass, or one " +
      "weaker than the global minimum, is a gate that is not there."
  );
  process.exit(1);
}

const globs = Object.keys(COVERAGE_GLOB_THRESHOLDS);

if (globs.length === 0) {
  console.error(
    "check-coverage-globs: no coverage glob thresholds are configured. " +
      "Every payment and compliance subtree would be ungated."
  );
  process.exit(1);
}

//
// Informational output goes to stdout; failures go to stderr.
//
const out = (line = "") => process.stdout.write(`${line}\n`);

const files = collectSourceFiles();
const results = globs.map((glob) => ({
  glob,
  matches: files.filter((file) => path.matchesGlob(file, glob)),
}));

for (const { glob, matches } of results) {
  const label = matches.length === 1 ? "file" : "files";
  out(`${matches.length} ${label}\t${glob}`);
}

const dead = results.filter(({ matches }) => matches.length === 0);

if (dead.length > 0) {
  console.error("");
  console.error(
    "check-coverage-globs: these threshold globs match no file, so Vitest " +
      "silently skips their coverage gate:"
  );

  for (const { glob } of dead) {
    console.error(`  - ${glob}`);
  }

  console.error("");
  console.error(
    "Fix the glob in apps/web/coverage-thresholds.mjs, or add the files it is " +
      "meant to cover. Do not delete the threshold: that is the gate."
  );
  process.exit(1);
}

out();
out(
  `All ${globs.length} coverage threshold globs resolve to files, and every floor ` +
    "is a valid percentage at or above the global minimum."
);
