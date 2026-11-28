/**
 * The scheduled provider-contract job must not produce a green run that
 * verified nothing.
 *
 * This is the mechanical version of the rule the workflow header states: the
 * contract suites skip themselves without credentials and still exit 0, so on a
 * scheduled run a deleted secret - or a suite that quietly stopped registering
 * tests - would look exactly like a passing contract. The job therefore counts
 * vitest's summary instead of trusting its exit code.
 *
 * A finding on 2026-11-28 reported the older grep form as "not gated in CI".
 * That premise was wrong - the job exists and fails on a full skip - but the
 * grep itself only caught `Tests  5 skipped (5)` and missed the partial form
 * `Tests  3 passed | 2 skipped (5)`, and nothing asserted that any test passed.
 * The guards below are what close those two holes, so a revert of either fails
 * here rather than six months later on a quiet scheduled run.
 */

import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const WORKFLOW = path.resolve(
  import.meta.dirname,
  "../../../.github/workflows/provider-contract-daily.yml"
);

const workflow = readFileSync(WORKFLOW, "utf8");

describe("provider-contract-daily workflow", () => {
  it("runs both provider suites on a schedule", () => {
    expect(workflow).toContain('cron: "10 5 * * *"');
    expect(workflow).toContain("tests/contract/paypal.contract.test.ts");
    expect(workflow).toContain("tests/contract/r2.contract.test.ts");
  });

  it("fails when the credentials are missing instead of skipping", () => {
    // Both jobs assert their secrets before installing dependencies, so a
    // renamed secret is an error rather than an empty green run.
    const credentialGuards = workflow.match(/Missing repository secret\(s\)/g) ?? [];

    expect(credentialGuards).toHaveLength(2);
  });

  it("counts skipped tests rather than matching one summary shape", () => {
    // `Tests  3 passed | 2 skipped (5)` is what vitest prints when part of a
    // suite skips; the old /Tests +N skipped \(/ pattern missed it entirely.
    expect(workflow).toContain(
      "skipped=\"$(grep -oE '[0-9]+ skipped' \"$log\" | head -1 | grep -oE '[0-9]+' || true)\""
    );
    expect(workflow).toContain('if [ "${skipped:-0}" -gt 0 ]');
  });

  it("refuses a run in which no contract test passed", () => {
    expect(workflow).toContain(
      "passed=\"$(grep -oE '[0-9]+ passed' \"$log\" | head -1 | grep -oE '[0-9]+' || true)\""
    );
    expect(workflow).toContain('if [ -z "$passed" ] || [ "$passed" -lt 1 ]');
  });
});
