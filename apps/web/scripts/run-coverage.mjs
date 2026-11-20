#!/usr/bin/env node
/**
 * `npm run test:coverage`, with an explanation when a threshold fails.
 *
 * Vitest's own failure text names the subtree and the percentage; it does not
 * say which files inside it are responsible. This wrapper runs the same
 * coverage command, streams its output unchanged, and on a non-zero exit runs
 * `explain-coverage.mjs` before exiting with the original status.
 *
 * A wrapper rather than an `||` chain in package.json because npm scripts run
 * through cmd.exe on Windows and sh on Linux, and only one of those parses
 * `(a; b)` the same way.
 *
 * Usage:
 *   npm run test:coverage            # same as before
 *   npm run test:coverage -- <args>  # forwarded to vitest
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const require = createRequire(import.meta.url);

/**
 * The vitest CLI entry, taken from the package's `bin` field.
 *
 * `vitest/vitest.mjs` is not an exported subpath in vitest 5, so
 * `require.resolve` on it throws ERR_PACKAGE_PATH_NOT_EXPORTED; `bin` is the
 * supported way to find the same file the shell shim would run.
 */
const vitestPackage = require.resolve("vitest/package.json");
const vitestManifest = JSON.parse(readFileSync(vitestPackage, "utf8"));
const vitestBin =
  typeof vitestManifest.bin === "string"
    ? vitestManifest.bin
    : vitestManifest.bin?.vitest;

if (!vitestBin) {
  console.error(
    "run-coverage: could not locate the vitest CLI in its package.json."
  );
  process.exit(1);
}

const vitestCli = path.resolve(path.dirname(vitestPackage), vitestBin);

const run = (command, args) =>
  spawnSync(process.execPath, [command, ...args], {
    stdio: "inherit",
    cwd: ROOT,
    env: process.env,
  });

const coverage = run(vitestCli, [
  "run",
  "--coverage",
  ...process.argv.slice(2),
]);

if (coverage.status !== 0) {
  // Explain only when there is coverage data to explain; test failures still
  // get the breakdown, which is harmless and often useful.
  run(path.join(ROOT, "scripts", "explain-coverage.mjs"), []);
}

process.exit(coverage.status ?? 1);
