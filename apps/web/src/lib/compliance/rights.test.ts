/**
 * `lib/compliance/rights.ts`.
 *
 * This module is constants and types only, so there is no behaviour to drive.
 * What it can get wrong is drift: a right added to `DATA_SUBJECT_RIGHTS` with no
 * deadline entry (which would make `logRightsRequest` compute `undefined` days
 * and store an Invalid Date as the response deadline), or a deadline keyed by a
 * string that is not a declared right (which nothing ever reads).
 */

import { describe, it, expect } from "vitest";

import { DATA_SUBJECT_RIGHTS, RIGHTS_DEADLINES } from "./rights";

const declaredRights = Object.values(DATA_SUBJECT_RIGHTS);

describe("RIGHTS_DEADLINES", () => {
  it("has an entry for every declared right", () => {
    expect(Object.keys(RIGHTS_DEADLINES).sort()).toEqual(
      [...declaredRights].sort()
    );
  });

  it("gives every right a positive, whole-day window", () => {
    for (const right of declaredRights) {
      const days = RIGHTS_DEADLINES[right];
      expect(Number.isInteger(days)).toBe(true);
      expect(days).toBeGreaterThan(0);
    }
  });

  it("uses the statutory 30-day response window", () => {
    // DPDP Act 2023 expects a response within 30 days. Changing one entry here
    // is a legal decision, not a refactor, so it should break a test.
    for (const right of declaredRights) {
      expect(RIGHTS_DEADLINES[right]).toBe(30);
    }
  });

  it("declares each right identifier exactly once", () => {
    expect(new Set(declaredRights).size).toBe(declaredRights.length);
    for (const value of declaredRights) {
      expect(value).toMatch(/^[a-z_]+$/);
    }
  });
});
