/**
 * Unit tests for the Redis-backed shared rate limiter.
 *
 * `@upstash/redis` and `@upstash/ratelimit` are mocked so no network calls are
 * made, which lets us exercise the three real paths: no Redis configured
 * (in-memory fallback), Redis answering, and Redis failing (the result is
 * flagged `unavailable`, so the proxy serves the request and /api/health
 * reports degraded).
 */

import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";

// These suites rebuild their module graph per test (they reset modules so each
// case gets a fresh instance). That is cheap normally but can exceed the
// default 5s ceiling when the whole suite runs unisolated on a loaded machine,
// which surfaced as spurious timeouts. The assertions are unchanged.
vi.setConfig({ testTimeout: 15_000 });

const state = vi.hoisted(() => ({
  url: "",
  token: "",
  isProduction: false,
  storeOptional: false,
  limit: vi.fn(),
  hset: vi.fn(),
  hgetall: vi.fn(),
  expire: vi.fn(),
}));

vi.mock("@/config/env", () => ({
  serverEnv: {
    PAYPAL_ENV: "sandbox",
    get UPSTASH_REDIS_REST_URL() {
      return state.url;
    },
    get UPSTASH_REDIS_REST_TOKEN() {
      return state.token;
    },
  },
  get isProduction() {
    return state.isProduction;
  },
  get isDevelopment() {
    return !state.isProduction;
  },
  RATE_LIMIT_STORE_OPTIONAL_ENV: "RATE_LIMIT_STORE_OPTIONAL",
  isRateLimitStoreOptional: () => state.storeOptional,
}));

vi.mock("@upstash/redis", () => ({
  Redis: class {
    hset = state.hset;
    hgetall = state.hgetall;
    expire = state.expire;

    constructor(_options: unknown) {}
  },
}));

vi.mock("@upstash/ratelimit", () => ({
  Ratelimit: class {
    static slidingWindow = vi.fn(() => ({}));

    limit = state.limit;

    constructor(_options: unknown) {}
  },
}));

// Imported per file instead of statically: with a shared module registry the
// first importer fixes which mocks this module binds to, so a static import
// can inherit another file's stub.
let createSharedRateLimiter: typeof import("./redisRateLimiter").createSharedRateLimiter;
let reportRateLimitStoreStatus: typeof import("./redisRateLimiter").reportRateLimitStoreStatus;
let RATE_LIMIT_ERROR_WINDOW_MS: typeof import("./redisRateLimiter").RATE_LIMIT_ERROR_WINDOW_MS;

beforeEach(async () => {
  vi.resetModules();
  ({
    createSharedRateLimiter,
    reportRateLimitStoreStatus,
    RATE_LIMIT_ERROR_WINDOW_MS,
  } = await import("./redisRateLimiter"));
});

const fallbackResult = {
  ok: true,
  limit: 100,
  remaining: 100,
  reset: Date.now() + 60_000,
};

function makeFallback() {
  return { record: vi.fn(async () => fallbackResult) };
}

function requestWith(ip = "1.2.3.4") {
  return new Request("http://localhost:3000/api/test", {
    headers: { "x-vercel-forwarded-for": ip },
  });
}

function configureRedis() {
  state.url = "https://t.upstash.io";
  state.token = "tok";
}

beforeEach(() => {
  // The platform header is trusted only when the deployment says so.
  vi.stubEnv("VERCEL", "1");
  state.url = "";
  state.token = "";
  state.isProduction = false;
  state.storeOptional = false;
  state.limit.mockReset();
  state.hset.mockReset().mockResolvedValue(1);
  state.hgetall.mockReset().mockResolvedValue({});
  state.expire.mockReset().mockResolvedValue(1);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("RATE_LIMIT_ERROR_WINDOW_MS", () => {
  it("is 5 minutes in ms", () => {
    expect(RATE_LIMIT_ERROR_WINDOW_MS).toBe(5 * 60 * 1000);
  });
});

describe("createSharedRateLimiter without Redis configured", () => {
  it("delegates to the in-memory fallback", async () => {
    const fallback = makeFallback();
    const limiter = createSharedRateLimiter("web", 100, 60_000, fallback);

    const result = await limiter.record(requestWith());

    expect(result).toEqual(fallbackResult);
    expect(fallback.record).toHaveBeenCalledTimes(1);
    expect(state.limit).not.toHaveBeenCalled();
  });
});

describe("createSharedRateLimiter in production without a shared store", () => {
  it("throws an error instead of silently degrading to per-instance limits", async () => {
    state.isProduction = true;
    const fallback = makeFallback();
    const limiter = createSharedRateLimiter("api", 30, 60_000, fallback);

    await expect(limiter.record(requestWith())).rejects.toThrow(
      "UPSTASH_REDIS_REST_URL and/or UPSTASH_REDIS_REST_TOKEN are not configured in production"
    );
    // Silent degradation to in-memory limits is exactly what must not happen.
    expect(fallback.record).not.toHaveBeenCalled();
  });

  it("throws an error when the configured URL is not https", async () => {
    state.isProduction = true;
    state.url = "http://insecure.example";
    state.token = "tok";
    const fallback = makeFallback();
    const limiter = createSharedRateLimiter("api", 30, 60_000, fallback);

    await expect(limiter.record(requestWith())).rejects.toThrow(
      "UPSTASH_REDIS_REST_URL and/or UPSTASH_REDIS_REST_TOKEN are not configured in production"
    );
    expect(fallback.record).not.toHaveBeenCalled();
  });

  it("names the opt-out variable an operator has to set", async () => {
    state.isProduction = true;
    const limiter = createSharedRateLimiter("api", 30, 60_000, makeFallback());

    const error = await limiter.record(requestWith()).catch((e: Error) => e);

    expect(error).toBeInstanceOf(Error);

    // The message used to interpolate the VALUE of an env var that names a
    // different env var, so the log an operator actually sees said
    // "set undefined=1".
    const message = (error as Error).message;
    expect(message).toContain("RATE_LIMIT_STORE_OPTIONAL=1");
    expect(message).not.toContain("undefined=1");
  });

  it("falls back to the in-memory limiter when the E2E opt-out is set", async () => {
    // The documented opt-out used to satisfy only the startup validator, so the
    // server booted and then answered 500 to every request; the E2E suite and
    // any local `npm start` died there.
    state.isProduction = true;
    state.storeOptional = true;
    const fallback = makeFallback();
    const limiter = createSharedRateLimiter("web", 100, 60_000, fallback);

    const result = await limiter.record(requestWith());

    expect(result).toEqual(fallbackResult);
    expect(fallback.record).toHaveBeenCalledTimes(1);
  });
});

describe("createSharedRateLimiter with Redis configured", () => {
  it("allows requests Redis accepts and keys the limit by client IP", async () => {
    configureRedis();
    state.limit.mockResolvedValue({
      success: true,
      remaining: 99,
      reset: 1_700_000_000_000,
    });
    const fallback = makeFallback();
    const limiter = createSharedRateLimiter("web", 100, 60_000, fallback);

    const result = await limiter.record(requestWith("203.0.113.9"));

    expect(result).toEqual({
      ok: true,
      limit: 100,
      remaining: 99,
      reset: 1_700_000_000_000,
    });
    expect(state.limit).toHaveBeenCalledWith("203.0.113.9");
    expect(fallback.record).not.toHaveBeenCalled();
  });

  it("passes through rejections from Redis", async () => {
    configureRedis();
    state.limit.mockResolvedValue({
      success: false,
      remaining: 0,
      reset: 1_700_000_000_000,
    });
    const limiter = createSharedRateLimiter("api", 30, 60_000, makeFallback());

    const result = await limiter.record(requestWith());

    expect(result.ok).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it("fails closed when the Redis call throws", async () => {
    configureRedis();
    state.limit.mockRejectedValue(new Error("redis down"));
    const fallback = makeFallback();
    const limiter = createSharedRateLimiter("strict", 10, 60_000, fallback);
    const before = Date.now();

    const result = await limiter.record(requestWith("198.51.100.7"));

    expect(result.ok).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.reset).toBeGreaterThanOrEqual(before + 60_000);
    // Fail-closed must not silently fall back to the permissive in-memory path.
    expect(fallback.record).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalled();
  });

  it("records recent Redis errors per limiter for health reporting", async () => {
    configureRedis();
    state.limit.mockRejectedValue(new Error("redis down"));
    const limiter = createSharedRateLimiter("login", 5, 60_000, makeFallback());
    const other = createSharedRateLimiter("web", 100, 60_000, makeFallback());

    await limiter.record(requestWith("198.51.100.7"));

    expect(await limiter.getErrorCounts(Date.now() - 60_000)).toEqual([
      { ip: "198.51.100.7", errors: 1, lastErrorAt: expect.any(Number) },
    ]);
    expect(await limiter.getErrorCounts(Date.now() + 60_000)).toEqual([]);
    expect(await other.getErrorCounts(0)).toEqual([]);
  });
});

describe("shared Redis error counters", () => {
  it("reports counts written by another instance", async () => {
    configureRedis();
    state.hgetall.mockResolvedValue({
      "203.0.113.4": JSON.stringify({
        errors: 4,
        lastErrorAt: Date.now() - 1000,
      }),
      "203.0.113.5": { errors: 1, lastErrorAt: Date.now() - 500 },
    });
    const limiter = createSharedRateLimiter("api", 30, 60_000, makeFallback());

    expect(await limiter.getErrorCounts(0)).toEqual([
      { ip: "203.0.113.4", errors: 4, lastErrorAt: expect.any(Number) },
      { ip: "203.0.113.5", errors: 1, lastErrorAt: expect.any(Number) },
    ]);
  });

  it("ignores malformed and stale entries", async () => {
    configureRedis();
    state.hgetall.mockResolvedValue({
      bad: "not json",
      wrongShape: JSON.stringify({ errors: "many", lastErrorAt: "soon" }),
      old: JSON.stringify({ errors: 2, lastErrorAt: 1 }),
    });
    const limiter = createSharedRateLimiter("web", 100, 60_000, makeFallback());

    expect(await limiter.getErrorCounts(Date.now() - 60_000)).toEqual([]);
  });

  it("keeps local counts when the store cannot be read", async () => {
    configureRedis();
    state.hgetall.mockRejectedValue(new Error("down"));
    state.limit.mockRejectedValue(new Error("redis down"));
    const limiter = createSharedRateLimiter(
      "strict",
      10,
      60_000,
      makeFallback()
    );

    await limiter.record(requestWith("198.51.100.9"));

    expect(await limiter.getErrorCounts(0)).toEqual([
      { ip: "198.51.100.9", errors: 1, lastErrorAt: expect.any(Number) },
    ]);
  });

  it("does not fail a request when the counter write fails", async () => {
    configureRedis();
    state.hset.mockRejectedValue(new Error("down"));
    state.limit.mockRejectedValue(new Error("redis down"));
    const limiter = createSharedRateLimiter("login", 5, 60_000, makeFallback());

    await expect(limiter.record(requestWith())).resolves.toMatchObject({
      ok: false,
    });
    await Promise.resolve();
  });
});

describe("reportRateLimitStoreStatus", () => {
  it("warns but keeps the server up in production when the shared store is missing", () => {
    state.isProduction = true;
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    // Boot must survive this: the proxy fails open and /api/health reports
    // `degraded`, so a missing store costs global limits, not the deployment.
    expect(reportRateLimitStoreStatus()).toEqual({
      configured: false,
      degraded: true,
    });
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Rate limits are per-instance only")
    );

    warnSpy.mockRestore();
  });

  it("is degraded in production when the Redis URL is not https", () => {
    state.isProduction = true;
    state.url = "http://insecure.example";
    state.token = "tok";
    vi.spyOn(console, "warn").mockImplementation(() => {});

    expect(reportRateLimitStoreStatus()).toEqual({
      configured: false,
      degraded: true,
    });
  });

  it("is degraded in production when the token is missing", () => {
    state.isProduction = true;
    state.url = "https://t.upstash.io";
    vi.spyOn(console, "warn").mockImplementation(() => {});

    expect(reportRateLimitStoreStatus()).toEqual({
      configured: false,
      degraded: true,
    });
  });

  it("reports configured and not degraded for a complete production configuration", () => {
    state.isProduction = true;
    configureRedis();
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    expect(reportRateLimitStoreStatus()).toEqual({
      configured: true,
      degraded: false,
    });
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("is not degraded outside production (dev/test falls back to in-memory)", () => {
    expect(reportRateLimitStoreStatus()).toEqual({
      configured: false,
      degraded: false,
    });
  });
});

describe("the E2E no-op switch", () => {
  it("serves every request without touching the store", async () => {
    // The local E2E suite is a production build, so the disable switch needs its
    // own acknowledgement on top of RATE_LIMIT_DISABLED.
    vi.stubEnv("RATE_LIMIT_DISABLED", "1");
    vi.stubEnv("E2E_RATE_LIMITS_DISABLED_ACK", "1");
    vi.stubEnv("NODE_ENV", "production");
    state.isProduction = true;
    state.storeOptional = true;
    const fallback = makeFallback();
    const limiter = createSharedRateLimiter("web", 100, 60_000, fallback);

    const results = await Promise.all(
      [1, 2, 3].map(() => limiter.record(requestWith()))
    );

    expect(results.map((result) => result.ok)).toEqual([true, true, true]);
    expect(results[0].remaining).toBe(100);
    expect(fallback.record).not.toHaveBeenCalled();
    expect(state.limit).not.toHaveBeenCalled();
  });

  it("applies to a development build as well", async () => {
    vi.stubEnv("RATE_LIMIT_DISABLED", "1");
    const fallback = makeFallback();
    const limiter = createSharedRateLimiter("web", 100, 60_000, fallback);

    await expect(limiter.record(requestWith())).resolves.toMatchObject({
      ok: true,
    });
    expect(fallback.record).not.toHaveBeenCalled();
  });

  it("ignored on a production deployment without the E2E opt-out", () => {
    vi.stubEnv("RATE_LIMIT_DISABLED", "1");
    vi.stubEnv("NODE_ENV", "production");
    state.isProduction = true;
    const limiter = createSharedRateLimiter("api", 30, 60_000, makeFallback());

    // A real deployment that picks the variable up by accident keeps its
    // limits: the missing store is still a hard failure there.
    return expect(limiter.record(requestWith())).rejects.toThrow(
      "not configured in production"
    );
  });

  it("does not let the store-check waiver double as the disable switch", async () => {
    // The finding this guards: copy the E2E environment (RATE_LIMIT_DISABLED +
    // RATE_LIMIT_STORE_OPTIONAL) into a production deployment and one waiver
    // used to switch enforcement off entirely. Waiving the boot check must not
    // grant that, so the ack variable is required on its own.
    vi.stubEnv("RATE_LIMIT_DISABLED", "1");
    vi.stubEnv("NODE_ENV", "production");
    state.isProduction = true;
    state.storeOptional = true;
    configureRedis();
    state.limit.mockResolvedValue({
      success: true,
      limit: 30,
      remaining: 29,
      reset: Date.now() + 60_000,
    });
    const fallback = makeFallback();
    const limiter = createSharedRateLimiter(
      "api-waiver",
      30,
      60_000,
      fallback
    );

    await limiter.record(requestWith());

    expect(state.limit).toHaveBeenCalledTimes(1);
    expect(fallback.record).not.toHaveBeenCalled();
  });

  it('stays off unless the variable is exactly "1"', async () => {
    vi.stubEnv("RATE_LIMIT_DISABLED", "true");
    const fallback = makeFallback();
    const limiter = createSharedRateLimiter("web", 100, 60_000, fallback);

    await limiter.record(requestWith());

    expect(fallback.record).toHaveBeenCalledTimes(1);
  });
});
