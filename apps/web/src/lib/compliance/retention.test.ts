// @vitest-environment node

import { describe, expect, it } from "vitest";
import {
  collectPhotoKeys,
  isPastRetention,
  photoStorageKey,
  retentionCutoff,
  toEpochMs,
} from "./retention";

describe("retentionCutoff", () => {
  it("subtracts whole months", () => {
    expect(
      retentionCutoff(24, new Date("2026-11-20T10:00:00Z")).toISOString()
    ).toBe("2024-11-20T10:00:00.000Z");
  });

  it("clamps a month-end date instead of rolling into the next month", () => {
    // 31 March minus one month must be 28 February (2025 is not a leap year).
    expect(
      retentionCutoff(1, new Date("2025-03-31T00:00:00Z")).toISOString()
    ).toBe("2025-02-28T00:00:00.000Z");
  });

  it("handles a leap day", () => {
    expect(
      retentionCutoff(12, new Date("2024-02-29T00:00:00Z")).toISOString()
    ).toBe("2023-02-28T00:00:00.000Z");
  });
});

describe("toEpochMs", () => {
  it("reads Firestore Timestamps, ISO strings and Dates", () => {
    const date = new Date("2024-01-01T00:00:00Z");

    expect(toEpochMs(date)).toBe(date.getTime());
    expect(toEpochMs("2024-01-01T00:00:00Z")).toBe(date.getTime());
    expect(toEpochMs({ toDate: () => date })).toBe(date.getTime());
    expect(toEpochMs({ seconds: date.getTime() / 1000 })).toBe(date.getTime());
  });

  it("returns null for anything it cannot parse", () => {
    expect(toEpochMs(undefined)).toBeNull();
    expect(toEpochMs(null)).toBeNull();
    expect(toEpochMs("not a date")).toBeNull();
    expect(toEpochMs(12345)).toBeNull();
    expect(toEpochMs({})).toBeNull();
  });
});

describe("isPastRetention", () => {
  const now = new Date("2026-11-20T00:00:00Z");

  it("expires a record exactly at the cutoff", () => {
    expect(isPastRetention("2024-11-20T00:00:00Z", 24, now)).toBe(true);
  });

  it("keeps a record one day inside the window", () => {
    expect(isPastRetention("2024-11-21T00:00:00Z", 24, now)).toBe(false);
  });

  it("never expires a record whose timestamp is missing or unreadable", () => {
    expect(isPastRetention(undefined, 24, now)).toBe(false);
    expect(isPastRetention("garbage", 24, now)).toBe(false);
  });
});

describe("photo keys", () => {
  it("accepts both stored shapes", () => {
    expect(photoStorageKey("inspection/r1/a.jpg")).toBe("inspection/r1/a.jpg");
    expect(
      photoStorageKey({ id: "p1", url: "inspection/r1/b.jpg", caption: "" })
    ).toBe("inspection/r1/b.jpg");
  });

  it("ignores blanks, numbers and missing urls", () => {
    expect(photoStorageKey("   ")).toBeNull();
    expect(photoStorageKey(42)).toBeNull();
    expect(photoStorageKey({ id: "p1" })).toBeNull();
    expect(photoStorageKey(null)).toBeNull();
  });

  it("collects every key a warehouse record points at, without duplicates", () => {
    expect(
      collectPhotoKeys({
        inspectionPhotos: ["inspection/r1/a.jpg", { url: "inspection/r1/b.jpg" }],
        photos: ["inspection/r1/a.jpg"],
        shippingLabel: "labels/r1.pdf",
      })
    ).toEqual([
      "inspection/r1/a.jpg",
      "inspection/r1/b.jpg",
      "labels/r1.pdf",
    ]);
  });

  it("returns nothing for a request with no photos", () => {
    expect(collectPhotoKeys(undefined)).toEqual([]);
    expect(collectPhotoKeys({})).toEqual([]);
    expect(collectPhotoKeys({ inspectionPhotos: null })).toEqual([]);
  });
});
