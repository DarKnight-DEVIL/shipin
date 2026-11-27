/**
 * Age calculation and child detection — pure date maths.
 *
 * The clock is pinned with `vi.setSystemTime` so the boundary cases do not
 * depend on the machine's timezone or the time of day the suite runs.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { calculateAge, isChild } from "./ageVerification";

afterEach(() => {
  vi.useRealTimers();
});

describe("compliance age verification (pure)", () => {
  it("calculateAge returns the right age for a known birthday", () => {
    vi.setSystemTime(new Date("2026-06-15T12:00:00Z"));
    expect(calculateAge("2000-06-15")).toBe(26);
    expect(calculateAge("2008-06-16")).toBe(17);
  });

  it("calculateAge turns 18 on the UTC birthday, not the server-local one", () => {
    // One hour before the birthday in UTC: still 17. One hour after: 18.
    // Parsing the DOB as server-local time used to make this flip with the
    // deployment region's timezone.
    vi.setSystemTime(new Date("2025-06-14T23:30:00Z"));
    expect(calculateAge("2007-06-15")).toBe(17);

    vi.setSystemTime(new Date("2025-06-15T00:30:00Z"));
    expect(calculateAge("2007-06-15")).toBe(18);
  });

  it("calculateAge accepts a full ISO timestamp and uses its date part", () => {
    vi.setSystemTime(new Date("2026-06-15T12:00:00Z"));
    expect(calculateAge("2000-06-15T08:30:00.000Z")).toBe(26);
  });

  it("isChild returns true for an under-18 birthday", () => {
    vi.setSystemTime(new Date("2026-06-15T12:00:00Z"));
    expect(isChild("2011-06-16")).toBe(true);
  });

  it("isChild returns false for an over-18 birthday", () => {
    vi.setSystemTime(new Date("2026-06-15T12:00:00Z"));
    expect(isChild("2007-06-14")).toBe(false);
  });

  it("isChild returns false when DOB is omitted", () => {
    expect(isChild()).toBe(false);
  });
});
