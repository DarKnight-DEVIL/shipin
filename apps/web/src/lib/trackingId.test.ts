import { describe, expect, it } from "vitest";

import { generateTrackingId } from "./trackingId";

/**
 * `/api/tracking/:trackingId` is public, so the id is the whole access control.
 * The old `SHP-<year>-<counter>` scheme let anyone holding one label read every
 * neighbouring shipment by incrementing the counter.
 */
describe("generateTrackingId", () => {
  it("mints an id in the random format", () => {
    const id = generateTrackingId();

    // 16 characters from Crockford base32: the shape a label carries, and the
    // shape the entropy argument above is made about.
    expect(id).toMatch(/^SHP-[0-9A-HJKMNP-TV-Z]{16}$/);
  });

  it("does not mint the sequential scheme any more", () => {
    const ids = Array.from({ length: 200 }, () => generateTrackingId());

    for (const id of ids) {
      expect(id).not.toMatch(/^SHP-\d{4}-\d{6}$/);
      // The year prefix was the giveaway: the old ids all shared it.
      expect(id).not.toContain(`${new Date().getFullYear()}-`);
    }
  });

  it("omits the characters that are easy to misread", () => {
    const ids = Array.from({ length: 500 }, () => generateTrackingId()).join(
      ""
    );

    expect(ids).not.toMatch(/[ILOU]/);
  });

  it("does not repeat ids", () => {
    const ids = new Set(
      Array.from({ length: 1000 }, () => generateTrackingId())
    );

    // 80 bits of entropy: a collision here would mean the alphabet or the byte
    // source is not what this module claims.
    expect(ids.size).toBe(1000);
  });

  it("does not advance by a counter", () => {
    const first = generateTrackingId();
    const second = generateTrackingId();

    // Consecutive draws are independent, not adjacent values.
    expect(second).not.toBe(first);
    expect(first.slice(4, 20)).not.toBe(second.slice(4, 20));
  });
});
