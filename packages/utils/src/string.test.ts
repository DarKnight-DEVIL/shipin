import { describe, expect, it, vi } from "vitest";

import { generateId } from "./string";

describe("generateId", () => {
  it("returns a v4 UUID, optionally prefixed", () => {
    expect(generateId("usr_")).toMatch(
      /^usr_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    );
    expect(generateId()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    );
  });

  it("does not draw from Math.random", () => {
    const random = vi.spyOn(Math, "random");

    generateId("order_");

    expect(random).not.toHaveBeenCalled();
    random.mockRestore();
  });

  it("is unique across calls made in the same millisecond", () => {
    const ids = new Set(Array.from({ length: 1000 }, () => generateId()));

    expect(ids.size).toBe(1000);
  });
});
