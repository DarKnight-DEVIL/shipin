import { describe, it, expect, afterEach, vi } from "vitest";

import { IDEMPOTENCY_KEY_PATTERN, newIdempotencyKey } from "./idempotencyKey";

afterEach(() => {
  // `crypto` is a global: leaving it stubbed would leak into other suites in
  // the same worker.
  vi.unstubAllGlobals();
});

describe("newIdempotencyKey", () => {
  it("mints a key the server accepts", () => {
    expect(newIdempotencyKey()).toMatch(IDEMPOTENCY_KEY_PATTERN);
  });

  it("mints a different key per user action", () => {
    // Sharing a key across two payments would make the second replay the
    // first, which is the failure mode this must never introduce.
    expect(newIdempotencyKey()).not.toBe(newIdempotencyKey());
  });

  it("falls back to random bytes when randomUUID is missing", () => {
    const getRandomValues = vi.fn((bytes: Uint8Array) => {
      bytes.fill(0xab);
      return bytes;
    });
    vi.stubGlobal("crypto", { getRandomValues });

    expect(newIdempotencyKey()).toBe("ab".repeat(16));
    expect(getRandomValues).toHaveBeenCalledTimes(1);
  });

  it("falls back to Math.random when there is no Web Crypto at all", () => {
    vi.stubGlobal("crypto", undefined);

    expect(newIdempotencyKey()).toMatch(IDEMPOTENCY_KEY_PATTERN);
  });
});
