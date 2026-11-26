// @vitest-environment node

/**
 * The App Check rejections that carry a *reason*.
 *
 * `/api/health` answers "how many requests were refused", and that number alone cannot
 * tell a reCAPTCHA quota outage from a client shipping a broken site key. These are the
 * paths that record the why - in the shared store when there is one, locally when there
 * is not - and the ones that must not throw when the store is unreachable, because a
 * rejected request is already a bad moment for the user.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const DETAIL_HASH = "shipin:appcheck:invalid-details";

const state = vi.hoisted(() => ({
  redis: null as {
    hincrby: ReturnType<typeof vi.fn>;
    expire: ReturnType<typeof vi.fn>;
    hgetall: ReturnType<typeof vi.fn>;
  } | null,
  warn: vi.fn(),
}));

vi.mock("./redisRateLimiter", () => ({
  getSharedRedisClient: () => state.redis,
}));

vi.mock("./logger", () => ({
  childLogger: () => ({
    info: vi.fn(),
    warn: (...args: unknown[]) => state.warn(...args),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

import {
  recordAppCheckFailureReason,
  recordAppCheckRejection,
  readAppCheckRejections,
  resetAppCheckMetricsForTests,
} from "./appCheckMetrics";

const BUCKET_MS = 5 * 60 * 1000;
const NOW = 1_700_000_000_000;

beforeEach(() => {
  state.redis = null;
  state.warn.mockReset();
  resetAppCheckMetricsForTests();
});

describe("recordAppCheckFailureReason", () => {
  it("writes the reason to the shared store and gives it a TTL", async () => {
    const hincrby = vi.fn().mockResolvedValue(1);
    const expire = vi.fn().mockResolvedValue(1);
    state.redis = { hincrby, expire, hgetall: vi.fn().mockResolvedValue({}) };

    recordAppCheckFailureReason("token expired", NOW);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(hincrby).toHaveBeenCalledWith(
      DETAIL_HASH,
      `${Math.floor(NOW / BUCKET_MS)}:token expired`,
      1
    );
    // Without the expiry the hash grows forever, one field per distinct message.
    expect(expire).toHaveBeenCalledWith(DETAIL_HASH, expect.any(Number));
  });

  it("logs and survives a store that refuses the write", async () => {
    state.redis = {
      hincrby: vi.fn().mockRejectedValue(new Error("store down")),
      expire: vi.fn().mockResolvedValue(1),
      hgetall: vi.fn().mockResolvedValue({}),
    };

    expect(() => recordAppCheckFailureReason("bad token", NOW)).not.toThrow();
    await Promise.resolve();
    await Promise.resolve();

    expect(state.warn).toHaveBeenCalledWith(
      "Could not record an App Check failure reason",
      expect.objectContaining({ error: "store down" })
    );
  });

  it("counts locally when there is no shared store, and health reports it", async () => {
    recordAppCheckFailureReason("no site key", NOW);

    const status = await readAppCheckRejections(NOW);

    // The local map is what a development deployment, or a degraded store, reports.
    expect(status.invalidReasons["no site key"]).toBe(1);
  });

  it("keeps a label that itself contains the separator", async () => {
    recordAppCheckFailureReason("400: something: odd", NOW);

    const status = await readAppCheckRejections(NOW);

    // Only the leading bucket is parsed apart; the rest is the label an operator reads.
    expect(status.invalidReasons["400: something: odd"]).toBe(1);
  });

  it("aggregates the same reason across buckets", async () => {
    recordAppCheckFailureReason("token expired", NOW);
    recordAppCheckFailureReason("token expired", NOW + BUCKET_MS);

    const status = await readAppCheckRejections(NOW + BUCKET_MS);

    expect(status.invalidReasons["token expired"]).toBe(2);
  });
});

describe("recordAppCheckRejection", () => {
  it("logs and survives a store that refuses the count", async () => {
    state.redis = {
      hincrby: vi.fn().mockRejectedValue(new Error("store down")),
      expire: vi.fn().mockResolvedValue(1),
      hgetall: vi.fn().mockResolvedValue({}),
    };

    expect(() => recordAppCheckRejection("missing", NOW)).not.toThrow();
    await Promise.resolve();
    await Promise.resolve();

    expect(state.warn).toHaveBeenCalledWith(
      "Could not record an App Check rejection in the shared store",
      expect.objectContaining({ error: "store down" })
    );
  });
});
