/**
 * Tests for the App Check rejection tracker.
 *
 * The tracker exists so a reCAPTCHA quota outage — where every client's
 * attestation starts failing at once — is visible to an operator through
 * /api/health and one deduplicated Sentry alert, instead of only per-user
 * banners. These tests cover the counting window, the spike threshold, the
 * Redis-to-memory fallback, and the alert dedupe.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const state = vi.hoisted(() => ({
  redis: null as {
    hincrby: ReturnType<typeof vi.fn>;
    expire: ReturnType<typeof vi.fn>;
    hgetall: ReturnType<typeof vi.fn>;
  } | null,
}));

vi.mock("./redisRateLimiter", () => ({
  getSharedRedisClient: () => state.redis,
}));

vi.mock("./logger", () => ({
  childLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

import {
  recordAppCheckRejection,
  readAppCheckRejections,
  reportAppCheckSpike,
  resetAppCheckMetricsForTests,
  setAppCheckAlertSenderForTests,
  APP_CHECK_SPIKE_THRESHOLD,
} from "./appCheckMetrics";

/** Records the alert messages the module would send to Sentry. */
const captureMessage = vi.fn<(message: string) => void>();

/** Five-minute bucket arithmetic, mirroring the module's constants. */
const BUCKET_MS = 5 * 60 * 1000;

function bucketAt(offsetBuckets: number, base = 1_700_000_000_000): number {
  return base + offsetBuckets * BUCKET_MS;
}

/** The bucket index the module derives from a timestamp. */
function bucketIndex(timestamp: number): string {
  return String(Math.floor(timestamp / BUCKET_MS));
}

beforeEach(() => {
  resetAppCheckMetricsForTests();
  captureMessage.mockReset();
  setAppCheckAlertSenderForTests(captureMessage);
  state.redis = null;
});

describe("recordAppCheckRejection / readAppCheckRejections", () => {
  it("counts rejections in memory when no shared store is configured", async () => {
    const now = bucketAt(0);
    recordAppCheckRejection(now);
    recordAppCheckRejection(now + 1000);

    const status = await readAppCheckRejections(now + 2000);
    expect(status.recentRejections).toBe(2);
    expect(status.spike).toBe(false);
  });

  it("marks a spike once the window total crosses the threshold", async () => {
    const now = bucketAt(0);
    for (let i = 0; i < APP_CHECK_SPIKE_THRESHOLD; i += 1) {
      recordAppCheckRejection(now + i);
    }

    const status = await readAppCheckRejections(now + BUCKET_MS);
    expect(status.recentRejections).toBe(APP_CHECK_SPIKE_THRESHOLD);
    expect(status.spike).toBe(true);
  });

  it("forgets buckets older than the ten-minute window", async () => {
    const old = bucketAt(-3); // two buckets before the window starts
    recordAppCheckRejection(old);
    recordAppCheckRejection(old + 1);
    recordAppCheckRejection(old + 2);

    const status = await readAppCheckRejections(bucketAt(0));
    expect(status.recentRejections).toBe(0);
    expect(status.spike).toBe(false);
  });

  it("aggregates the current and previous Redis buckets", async () => {
    const now = bucketAt(1);
    state.redis = {
      hincrby: vi.fn().mockResolvedValue(1),
      expire: vi.fn().mockResolvedValue(1),
      hgetall: vi.fn().mockResolvedValue({
        [bucketIndex(now)]: "7", // current bucket
        [bucketIndex(now - BUCKET_MS)]: "15", // previous — inside the window
        [bucketIndex(now - 2 * BUCKET_MS)]: "500", // outside — must be ignored
      }),
    };

    const status = await readAppCheckRejections(now);
    expect(status.recentRejections).toBe(22);
    expect(status.spike).toBe(true);
  });

  it("falls back to local counts when the shared store read fails", async () => {
    const now = bucketAt(0);
    recordAppCheckRejection(now);
    state.redis = {
      hincrby: vi.fn().mockResolvedValue(1),
      expire: vi.fn().mockResolvedValue(1),
      hgetall: vi.fn().mockRejectedValue(new Error("store down")),
    };

    const status = await readAppCheckRejections(now);
    // A store outage must not read as a false zero.
    expect(status.recentRejections).toBe(1);
  });

  it("writes rejections through to the shared store when configured", async () => {
    const hincrby = vi.fn().mockResolvedValue(1);
    const expire = vi.fn().mockResolvedValue(1);
    state.redis = {
      hincrby,
      expire,
      hgetall: vi.fn().mockResolvedValue({}),
    };

    recordAppCheckRejection(bucketAt(0));
    // The write is fire-and-forget; give the microtask queue a tick.
    await Promise.resolve();
    await Promise.resolve();

    expect(hincrby).toHaveBeenCalledWith(
      "shipin:appcheck:rejections",
      expect.any(String),
      1
    );
    expect(expire).toHaveBeenCalled();
  });
});

describe("reportAppCheckSpike", () => {
  it("alerts once per bucket and not again for the same window", () => {
    const status = { recentRejections: 50, spike: true };

    expect(reportAppCheckSpike(status, bucketAt(0))).toBe(true);
    expect(captureMessage).toHaveBeenCalledTimes(1);
    expect(captureMessage.mock.calls[0][0]).toContain("APP_CHECK_FAILED");

    // Health probes poll every few seconds: the same window must not re-alert.
    expect(reportAppCheckSpike(status, bucketAt(0) + 5000)).toBe(false);
    expect(captureMessage).toHaveBeenCalledTimes(1);
  });

  it("alerts again only when a new bucket spikes", () => {
    const status = { recentRejections: 50, spike: true };
    reportAppCheckSpike(status, bucketAt(0));

    expect(reportAppCheckSpike(status, bucketAt(1))).toBe(true);
    expect(captureMessage).toHaveBeenCalledTimes(2);
  });

  it("stays silent below the threshold", () => {
    expect(
      reportAppCheckSpike({ recentRejections: 3, spike: false }, bucketAt(0))
    ).toBe(false);
    expect(captureMessage).not.toHaveBeenCalled();
  });

  it("mentions the escape hatch in the alert body", () => {
    reportAppCheckSpike({ recentRejections: 99, spike: true }, bucketAt(0));
    expect(captureMessage.mock.calls[0][0]).toContain(
      "APP_CHECK_ENFORCEMENT=false"
    );
  });
});
