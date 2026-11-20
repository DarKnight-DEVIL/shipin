import { afterEach, describe, expect, it, vi } from "vitest";

import {
  addDays,
  daysBetween,
  formatDate,
  formatRelativeTime,
  isDateInPast,
} from "./date";

afterEach(() => {
  vi.useRealTimers();
});

describe("formatDate", () => {
  it("formats a Date and an ISO string the same way", () => {
    expect(formatDate(new Date(2026, 0, 15))).toBe("January 15th, 2026");
    expect(formatDate("2026-01-15T00:00:00")).toBe("January 15th, 2026");
  });

  it("accepts a custom date-fns pattern", () => {
    expect(formatDate(new Date(2026, 0, 15), "yyyy-MM-dd")).toBe("2026-01-15");
  });

  it("returns a placeholder instead of throwing on an unparseable string", () => {
    expect(formatDate("not-a-date")).toBe("Invalid date");
  });
});

describe("formatRelativeTime", () => {
  it("describes a past date with a suffix", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-15T12:00:00Z"));

    expect(formatRelativeTime(new Date("2026-01-15T11:00:00Z"))).toBe(
      "about 1 hour ago"
    );
  });

  it("returns a placeholder for an invalid date", () => {
    expect(formatRelativeTime("nope")).toBe("Unknown");
  });
});

describe("isDateInPast", () => {
  it("compares both Date and string input against now", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-15T12:00:00Z"));

    expect(isDateInPast("2026-01-15T11:00:00Z")).toBe(true);
    expect(isDateInPast(new Date("2026-01-15T13:00:00Z"))).toBe(false);
  });
});

describe("addDays", () => {
  it("returns a new date and leaves the input untouched", () => {
    const start = new Date(2026, 0, 30);
    const result = addDays(start, 3);

    expect(result.toDateString()).toBe(new Date(2026, 1, 2).toDateString());
    expect(start.getDate()).toBe(30);
  });

  it("moves backwards for a negative count", () => {
    expect(addDays(new Date(2026, 1, 1), -1).getMonth()).toBe(0);
  });
});

describe("daysBetween", () => {
  it("rounds up partial days and ignores order", () => {
    const start = new Date("2026-01-01T00:00:00Z");

    expect(daysBetween(start, new Date("2026-01-03T00:00:00Z"))).toBe(2);
    expect(daysBetween(new Date("2026-01-03T00:00:00Z"), start)).toBe(2);
    expect(daysBetween(start, new Date("2026-01-02T01:00:00Z"))).toBe(2);
  });
});
