#!/usr/bin/env node
/**
 * Explains a failed coverage threshold: which files dragged its subtree down.
 *
 * Vitest reports a failing glob as one line — `branches (91.17%) does not meet
 * "src/app/api/paypal/**" threshold (100%)` — and leaves you to find the files
 * responsible. On a glob covering dozens of routes that search is the actual
 * work, and it happens exactly when you least want to do it.
 *
 * This reads `coverage/coverage-final.json` (written by the existing `json`
 * reporter) and, for every subtree that missed its floor, ranks the files in it
 * by how much they contribute to the miss, with the uncovered line numbers.
 *
 * It is a post-mortem, not a gate: `run-coverage.mjs` invokes it only after
 * Vitest has already failed, and it exits 0 unless it printed a failure.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { COVERAGE_GLOB_THRESHOLDS } from "../coverage-thresholds.mjs";

const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const COVERAGE_FILE = path.join(ROOT, "coverage", "coverage-final.json");

/** How many files to name per failing subtree before summarising the rest. */
const MAX_FILES = 6;

const out = (line = "") => process.stdout.write(`${line}\n`);
const err = (line = "") => process.stderr.write(`${line}\n`);

/**
 * Metrics for one file, computed the way the thresholds are expressed:
 * statements and functions from their maps, branches from every arm, and lines
 * derived from the statements that start on each line (Istanbul's rule; Vitest
 * 5 keeps its own mapping, so lines can differ by a fraction of a point — the
 * branch numbers, which is what usually fails, are exact).
 */
export function fileMetrics(fileCoverage) {
  const statementEntries = Object.entries(fileCoverage.s ?? {});
  const coveredStatements = statementEntries.filter(([, count]) => count > 0).length;

  const functionEntries = Object.entries(fileCoverage.f ?? {});
  const coveredFunctions = functionEntries.filter(([, count]) => count > 0).length;

  const branchEntries = Object.entries(fileCoverage.b ?? {});
  const branchArms = branchEntries.flatMap(([, counts]) => counts);
  const coveredBranches = branchArms.filter((count) => count > 0).length;

  const lineHits = new Map();
  for (const [id, count] of statementEntries) {
    const statement = fileCoverage.statementMap?.[id];
    if (!statement) continue;

    const { start, end } = statement;
    const lastLine = end?.line && end.line >= start.line ? end.line : start.line;

    for (let line = start.line; line <= lastLine; line += 1) {
      lineHits.set(line, (lineHits.get(line) ?? false) || count > 0);
    }
  }

  return {
    covered: {
      statements: coveredStatements,
      functions: coveredFunctions,
      branches: coveredBranches,
      lines: [...lineHits.values()].filter(Boolean).length,
    },
    total: {
      statements: statementEntries.length,
      functions: functionEntries.length,
      branches: branchArms.length,
      lines: lineHits.size,
    },
    /**
     * Lines with an uncovered statement, for the "where do I look" hint.
     * Deduplicated: several statements can start on one line, and repeating it
     * (`lines 33,33,34`) just makes the hint harder to read.
     */
    uncoveredLines: [
      ...new Set(
        statementEntries
          .filter(([, count]) => count === 0)
          .map(([id]) => fileCoverage.statementMap?.[id]?.start?.line)
          .filter((line) => typeof line === "number")
      ),
    ],
  };
}

const percent = (covered, total) => (total === 0 ? 100 : (covered / total) * 100);

/**
 * Files inside one glob, worst contributor first.
 *
 * Ranking is by uncovered units for the metric that failed, so the file that
 * actually pulled the aggregate down is the first line you read.
 */
export function rankOffenders(files, metric) {
  return files
    .map(({ file, metrics }) => {
      const total = metrics.total[metric];
      const covered = metrics.covered[metric];

      return {
        file,
        percent: percent(covered, total),
        uncovered: total - covered,
        uncoveredLines: metrics.uncoveredLines,
      };
    })
    .filter(({ uncovered }) => uncovered > 0)
    .sort((a, b) => b.uncovered - a.uncovered);
}

/** Load coverage-final.json into `{ relativePath → metrics }`. */
export function loadMetrics(coverageFile = COVERAGE_FILE) {
  const raw = JSON.parse(readFileSync(coverageFile, "utf8"));

  return Object.entries(raw).map(([absolutePath, fileCoverage]) => ({
    file: path
      .relative(ROOT, absolutePath)
      .split(path.sep)
      .join("/"),
    metrics: fileMetrics(fileCoverage),
  }));
}

function main() {
  if (!existsSync(COVERAGE_FILE)) {
    err(
      "explain-coverage: coverage/coverage-final.json is missing, so there is " +
        "nothing to analyse. Run `npm run test:coverage` without `--coverage=false`."
    );
    return 0;
  }

  const files = loadMetrics();
  const failures = [];

  for (const [glob, floors] of Object.entries(COVERAGE_GLOB_THRESHOLDS)) {
    const inGlob = files.filter(({ file }) => path.matchesGlob(file, glob));
    if (inGlob.length === 0) continue;

    const missed = [];
    for (const metric of ["branches", "lines", "statements", "functions"]) {
      const floor = floors[metric];
      if (typeof floor !== "number") continue;

      const covered = inGlob.reduce((sum, entry) => sum + entry.metrics.covered[metric], 0);
      const total = inGlob.reduce((sum, entry) => sum + entry.metrics.total[metric], 0);
      const actual = percent(covered, total);

      if (actual < floor) missed.push({ metric, actual, floor });
    }

    if (missed.length > 0) failures.push({ glob, inGlob, missed });
  }

  if (failures.length === 0) {
    out("explain-coverage: every payment and compliance subtree meets its floor.");
    return 0;
  }

  out("");
  out("Which files dragged each failing subtree below its floor:");
  out("");

  for (const { glob, inGlob, missed } of failures) {
    out(`  ${glob}  (${inGlob.length} file${inGlob.length === 1 ? "" : "s"})`);

    for (const { metric, actual, floor } of missed) {
      out(`    ${metric}: ${actual.toFixed(2)}% < ${floor}%`);

      const offenders = rankOffenders(inGlob, metric).slice(0, MAX_FILES);

      for (const offender of offenders) {
        const lines =
          offender.uncoveredLines.length > 0
            ? `  lines ${offender.uncoveredLines.slice(0, 8).join(",")}`
            : "";
        out(
          `      ${offender.percent.toFixed(2).padStart(6)}%  ` +
            `${String(offender.uncovered).padStart(4)} uncovered  ` +
            `${offender.file}${lines}`
        );
      }

      const ranked = rankOffenders(inGlob, metric);
      if (ranked.length > MAX_FILES) {
        const rest = ranked.slice(MAX_FILES);
        const restUncovered = rest.reduce((sum, entry) => sum + entry.uncovered, 0);
        out(`      … ${rest.length} more file(s), ${restUncovered} uncovered ${metric}`);
      }
    }

    out("");
  }

  out("Each line above is one file, not one test: add tests there, or delete code");
  out("that cannot run. Do not lower the floor — that is the gate.");

  return 1;
}

// Only run as a CLI: the helpers above are imported by nothing yet, but keeping
// the guard means a future test can import them without triggering output.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main();
}
