import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { formatTimeAgo } from "./formatTimeAgo";

const NOW = new Date("2026-06-01T12:00:00.000Z").getTime();

function ago(ms: number): string {
  return new Date(NOW - ms).toISOString();
}

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("formatTimeAgo", () => {
  it("describes just-now and singular units", () => {
    expect(formatTimeAgo(ago(0))).toBe("just now");
    expect(formatTimeAgo(ago(30 * 1000))).toBe("just now");
    expect(formatTimeAgo(ago(MINUTE))).toBe("1 minute ago");
    expect(formatTimeAgo(ago(HOUR))).toBe("1 hour ago");
    expect(formatTimeAgo(ago(DAY))).toBe("1 day ago");
    expect(formatTimeAgo(ago(30 * DAY))).toBe("1 month ago");
    expect(formatTimeAgo(ago(365 * DAY))).toBe("1 year ago");
  });

  it("pluralises larger units", () => {
    expect(formatTimeAgo(ago(5 * MINUTE))).toBe("5 minutes ago");
    expect(formatTimeAgo(ago(3 * HOUR))).toBe("3 hours ago");
    expect(formatTimeAgo(ago(3 * DAY))).toBe("3 days ago");
    expect(formatTimeAgo(ago(90 * DAY))).toBe("3 months ago");
    expect(formatTimeAgo(ago(800 * DAY))).toBe("2 years ago");
  });

  it("never reports a future timestamp as negative time", () => {
    expect(formatTimeAgo(ago(-DAY))).toBe("just now");
  });
});
