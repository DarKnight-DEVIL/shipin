/**
 * Unit tests for the in-memory rate limiter (InMemoryRateLimiter).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { InMemoryRateLimiter } from "./rateLimiter";

function createRequest(
  headers: Record<string, string> = {},
  url = "http://example.com/api/test"
): Request {
  return {
    headers: new Map(
      Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v])
    ),
    url,
    method: "POST",
    clone: function () {
      return this;
    },
    json: async () => ({}),
    text: async () => JSON.stringify({}),
  } as unknown as Request;
}

describe("InMemoryRateLimiter", () => {
  let limiter: InMemoryRateLimiter;

  beforeEach(() => {
    // Forwarded headers are read only in a declared proxy deployment.
    vi.stubEnv("VERCEL", "1");
    limiter = new InMemoryRateLimiter({
      maxRequests: 5,
      windowMs: 60_000,
      message: "Test limit",
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("drops idle buckets on the next request instead of holding a timer", async () => {
    vi.useFakeTimers();

    try {
      const idle = new InMemoryRateLimiter({
        maxRequests: 5,
        windowMs: 60_000,
        message: "x",
      });
      await idle.record(createRequest({ "x-vercel-forwarded-for": "9.9.9.9" }));

      expect(idle.trackedBuckets).toBe(1);

      await vi.advanceTimersByTimeAsync(61_000);

      // Deliberately no background sweep: one timer per limiter instance is a
      // leak in a hot-reloaded dev server and a needless wakeup in each lambda.
      // The bucket is still held until traffic arrives.
      expect(idle.trackedBuckets).toBe(1);

      // `record()` prunes every bucket, so the dead one goes as soon as any
      // request reaches the limiter — a quiet process never accumulates them.
      await idle.record(createRequest({ "x-vercel-forwarded-for": "8.8.8.8" }));

      expect(idle.trackedBuckets).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("allows requests under the limit", async () => {
    const req = createRequest({ "x-vercel-forwarded-for": "1.2.3.4" });
    for (let i = 0; i < 5; i++) {
      const result = await limiter.record(req);
      expect(result.ok).toBe(true);
      expect(result.limit).toBe(5);
      expect(result.remaining).toBe(4 - i);
    }
  });

  it("rejects the 6th request from the same IP", async () => {
    const req = createRequest({ "x-vercel-forwarded-for": "1.2.3.4" });
    for (let i = 0; i < 5; i++) await limiter.record(req);
    const result = await limiter.record(req);
    expect(result.ok).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it("tracks different IPs independently", async () => {
    const req1 = createRequest({ "x-vercel-forwarded-for": "1.2.3.4" });
    const req2 = createRequest({ "x-vercel-forwarded-for": "5.6.7.8" });
    for (let i = 0; i < 5; i++) await limiter.record(req1);
    const result = await limiter.record(req2);
    expect(result.ok).toBe(true);
    expect(result.remaining).toBe(4);
  });

  it("falls back to the forwarded chain when no platform header is present", async () => {
    const req = createRequest({
      "x-forwarded-for": "203.0.113.195, 70.41.3.18",
    });
    const result = await limiter.record(req);
    expect(result.ok).toBe(true);
  });

  it("falls back to 127.0.0.1 when no trusted headers present", async () => {
    const req = createRequest({});
    const result = await limiter.record(req);
    expect(result.ok).toBe(true);
  });

  it("ignores cf-connecting-ip, which the platform does not set", async () => {
    const spoofed = createRequest({ "cf-connecting-ip": "9.9.9.9" });
    for (let i = 0; i < 5; i++) await limiter.record(spoofed);

    // The spoofed header must not create a fresh bucket...
    expect((await limiter.record(spoofed)).ok).toBe(false);
    // ...nor may a different spoofed value buy another bucket.
    expect(
      (await limiter.record(createRequest({ "cf-connecting-ip": "8.8.8.8" })))
        .ok
    ).toBe(false);
  });

  it("keys on the platform address even when the client sends its own", async () => {
    const spoofed = createRequest({
      "x-vercel-forwarded-for": "203.0.113.7",
      "x-forwarded-for": "9.9.9.9",
      "cf-connecting-ip": "8.8.8.8",
    });
    for (let i = 0; i < 5; i++) await limiter.record(spoofed);

    // The same platform address, with no client headers, is the same bucket.
    expect(
      (
        await limiter.record(
          createRequest({ "x-vercel-forwarded-for": "203.0.113.7" })
        )
      ).ok
    ).toBe(false);
  });

  it("resets after the window expires", async () => {
    vi.useFakeTimers();
    try {
      const windowLimiter = new InMemoryRateLimiter({
        maxRequests: 1,
        windowMs: 1000,
        message: "Test",
      });
      const req = createRequest({ "x-vercel-forwarded-for": "1.2.3.4" });
      await windowLimiter.record(req);
      expect((await windowLimiter.record(req)).ok).toBe(false);
      await vi.advanceTimersByTimeAsync(1100);
      expect((await windowLimiter.record(req)).ok).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});
