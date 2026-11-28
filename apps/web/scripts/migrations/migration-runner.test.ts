/**
 * `migration-runner all` must stay a real "apply everything pending" command.
 *
 * The first production run was a sequence of five manual invocations, and the
 * two that printed "already applied" looked exactly like two that had silently
 * done nothing until the output was read line by line. `all` exists so that is
 * one command with a summary at the end.
 *
 * These assertions are source-level on purpose: the runner talks to a real
 * Firestore on import, so a behavioural test would need an emulator and would
 * re-test the loop rather than the two things that broke when it was written -
 * the helper script being treated as a migration, and rollback being offered
 * for a sequence.
 */

import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const RUNNER = path.resolve(
  import.meta.dirname,
  "migration-runner.ts"
);

const source = readFileSync(RUNNER, "utf8");

describe("migration runner: all", () => {
  it("advertises the mode in its usage", () => {
    expect(source).toContain("<migration-name|all>");
  });

  it("never treats the dry-run helper as a migration", () => {
    expect(source).toContain('(name) => name !== "dry-run-all"');
  });

  it("refuses --down for a sequence", () => {
    expect(source).toContain(
      "--down needs a specific migration: rollbacks are per-migration and only some exist."
    );
  });

  it("skips applied migrations and prints a summary", () => {
    expect(source).toContain("already applied`");
    expect(source).toContain("=== Summary ===");
  });
});
