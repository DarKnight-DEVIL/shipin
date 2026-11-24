/**
 * `serializeFirestoreJson` — Firestore documents over JSON.
 *
 * The rule that matters: a Timestamp becomes `{ seconds, nanoseconds }` at any
 * depth, and nothing else is touched. A plain object that happens to have a
 * `seconds` field is data, and rewriting it would corrupt it.
 */

import { describe, it, expect } from "vitest";

import { serializeFirestoreJson } from "./firestoreJson";

/** The shape the Admin SDK hands back for a stored timestamp. */
const timestamp = (seconds: number, nanoseconds = 0) => ({
  seconds,
  nanoseconds,
  toDate: () => new Date(seconds * 1000 + nanoseconds / 1e6),
  toMillis: () => seconds * 1000 + nanoseconds / 1e6,
});

describe("serializeFirestoreJson", () => {
  it("serializes a top-level Timestamp", () => {
    expect(
      serializeFirestoreJson({ createdAt: timestamp(1700000000, 500) })
    ).toEqual({
      createdAt: { seconds: 1700000000, nanoseconds: 500 },
    });
  });

  it("defaults a missing nanoseconds field", () => {
    const value = { seconds: 1700000000, toDate: () => new Date() };

    expect(serializeFirestoreJson(value)).toEqual({
      seconds: 1700000000,
      nanoseconds: 0,
    });
  });

  it("reaches Timestamps inside arrays and nested objects", () => {
    expect(
      serializeFirestoreJson({
        purchases: [{ vendor: "Amazon", purchasedAt: timestamp(1700000200) }],
        quote: { expiresAt: timestamp(1700000300, 1) },
      })
    ).toEqual({
      purchases: [
        {
          vendor: "Amazon",
          purchasedAt: { seconds: 1700000200, nanoseconds: 0 },
        },
      ],
      quote: { expiresAt: { seconds: 1700000300, nanoseconds: 1 } },
    });
  });

  it("leaves primitives, null and plain objects alone", () => {
    expect(serializeFirestoreJson("text")).toBe("text");
    expect(serializeFirestoreJson(null)).toBeNull();
    expect(serializeFirestoreJson(5)).toBe(5);
    expect(serializeFirestoreJson({ storage: { seconds: 30 } })).toEqual({
      storage: { seconds: 30 },
    });
    expect(serializeFirestoreJson({ nested: [[{ a: 1 }]] })).toEqual({
      nested: [[{ a: 1 }]],
    });
  });
});
