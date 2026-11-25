/**
 * Every Playwright spec must be reachable from CI.
 *
 * Three suites used to sit in `playwright-test/tests/` and pass while nothing
 * ran them: `accessibility.spec.ts` (axe on the public pages) and a duplicated
 * `auth-flow.spec.ts` were missing from the `SPECS` list in
 * `scripts/e2e-local.mjs`, and the README still advertised "an axe accessibility
 * job". A spec nobody runs is worse than no spec: it reads as coverage and
 * silently rots.
 *
 * This test is the mechanical version of that rule — a new spec file fails CI
 * until it is either added to the suite or listed below as deliberately out of
 * scope.
 */

import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const SPEC_DIR = path.resolve(import.meta.dirname, "../playwright-test/tests");
const RUNNER = path.resolve(import.meta.dirname, "e2e-local.mjs");

/** Suites that intentionally never run in CI, with the reason. */
const EXCLUDED: Record<string, string> = {
  // Needs a real PayPal sandbox checkout against a deployed URL; it runs by
  // hand against staging (see DEPLOYMENT.md).
  "admin-refund.spec.ts": "manual staging run",
};

describe("Playwright suite wiring", () => {
  const runner = readFileSync(RUNNER, "utf8");
  const specs = readdirSync(SPEC_DIR).filter((file) => file.endsWith(".spec.ts"));

  it("finds the spec files", () => {
    expect(specs.length).toBeGreaterThan(5);
  });

  it("names every spec in the CI runner or in the exclusion list", () => {
    const unreferenced = specs.filter(
      (file) =>
        !runner.includes(`tests/${file}`) &&
        !(file in EXCLUDED)
    );

    expect(unreferenced).toEqual([]);
  });

  it("keeps the exclusion list honest", () => {
    // A name that no longer exists hides the next real exclusion behind a typo.
    for (const file of Object.keys(EXCLUDED)) {
      expect(specs).toContain(file);
    }
  });
});
