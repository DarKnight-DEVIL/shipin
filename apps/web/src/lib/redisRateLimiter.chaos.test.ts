// @vitest-environment node
/**
 * Fault injection for the shared rate limiter: the store dies mid-burst, stays
 * dead under load, and comes back.
 *
 * The flags these answer: "no load/stress tests for the rate limiter under Redis
 * contention" and "no chaos testing (Redis kill)". The unit suite already covers one
 * failed call and the health counters; what it does not cover is the behaviours that
 * only show up under concurrency and a sustained outage:
 *
 *   - a burst of parallel callers must trip the limit at exactly `maxRequests`,
 *     never one more, even when every call is in flight at once;
 *   - during a total outage every caller is still served (fail open) and every
 *     failure is counted exactly once - a lost or doubled count is a health signal
     // that lies;
 *   - when the store recovers, the limiter returns to enforcing without a restart,
 *     and the outage must never have quietly degraded into the per-instance
 *     in-memory fallback (that is the bypass an attacker wants).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  url: "",
  token: "",
  isProduction: false,
  limit: vi.fn(),
  hset: vi.fn(),
  hgetall: vi.fn(),
  expire: vi.fn(),
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

vi.mock("@/config/env", () => ({
  serverEnv: {
    NODE_ENV: "test",
    FIREBASE_ADMIN_PROJECT_ID: "test-project",
    FIREBASE_ADMIN_CLIENT_EMAIL: "test@test.com",
    FIREBASE_ADMIN_PRIVATE_KEY: "test-key",
    PAYPAL_CLIENT_ID: "test-client-id",
    PAYPAL_CLIENT_SECRET: "test-secret",
    PAYPAL_ENV: "sandbox",
    PAYPAL_WEBHOOK_ID: "test-webhook-id",
    SMTP_EMAIL: "test@test.com",
    SMTP_PASSWORD: "test-password",
    RESEND_API_KEY: "test-resend-key",
    R2_ACCOUNT_ID: "test-account",
    R2_ACCESS_KEY_ID: "test-key-id",
    R2_SECRET_ACCESS_KEY: "test-secret-key",
    R2_BUCKET_NAME: "test-bucket",
    R2_REGION: "auto",
    R2_ENDPOINT: "",
    APP_URL: "http://localhost:3000",
    MFA_SESSION_SECRET: "test-mfa-session-secret-0123456789abcdef",
    BREACH_ALERT_WEBHOOK_URL: "",
    get UPSTASH_REDIS_REST_URL() {
      return state.url;
    },
    get UPSTASH_REDIS_REST_TOKEN() {
      return state.token;
    },
  },
  clientEnv: {
    NODE_ENV: "test",
    NEXT_PUBLIC_PAYPAL_CLIENT_ID: "test-client-id",
    NEXT_PUBLIC_APP_URL: "http://localhost:3000",
    NEXT_PUBLIC_FIREBASE_API_KEY: "test-key",
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: "test.firebaseapp.com",
    NEXT_PUBLIC_FIREBASE_PROJECT_ID: "test-project",
    NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: "123456",
    NEXT_PUBLIC_FIREBASE_APP_ID: "1:123456:web:abcdef",
    NEXT_PUBLIC_FIREBASE_APP_CHECK_SITE_KEY: "",
    NEXT_PUBLIC_FIREBASE_APP_CHECK_DEBUG: "",
    /** Empty: only a local E2E build sets these (see scripts/e2e-local.mjs). */
    NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST: "",
    NEXT_PUBLIC_FIRESTORE_EMULATOR_HOST: "",
  },
  isDevelopment: true,
  isTest: true,
  get isProduction() {
    return state.isProduction;
  },
}));

// Mock React context providers
vi.mock("@/components/ThemeProvider", () => ({
  default: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("@/components/PayPalProvider", () => ({
  default: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("@/components/AuthRedirectHandler", () => ({
  default: () => null,
}));

// Mock crypto.randomUUID for tests
if (typeof globalThis.crypto === "undefined") {
  Object.defineProperty(globalThis, "crypto", {
    configurable: true,
    value: {
      randomUUID: () => "test-uuid-" + Math.random().toString(36).slice(2),
      getRandomValues: (arr: Uint8Array) => {
        for (let i = 0; i < arr.length; i++) {
          arr[i] = Math.floor(Math.random() * 256);
        }
        return arr;
      },
    },
  });
}

// Mock Resend
vi.mock("resend", () => ({
  Resend: vi.fn().mockImplementation(() => ({
    emails: {
      send: vi
        .fn()
        .mockResolvedValue({ data: { id: "test-email-id" }, error: null }),
    },
  })),
}));

// Suppress console.error in tests (optional - remove if you want to see errors)
const originalError = console.error;
beforeAll(() => {
  console.error = (...args) => {
    if (
      typeof args[0] === "string" &&
      (args[0].includes("Warning: ReactDOM.render is no longer supported") ||
        args[0].includes("act(...)"))
    ) {
      return;
    }
    originalError.call(console, ...args);
  };
});

let createSharedRateLimiter: typeof import("./redisRateLimiter").createSharedRateLimiter;
let resetSharedRedisClientForTests: typeof import("./redisRateLimiter").resetSharedRedisClientForTests;
let setStoreOutageAlertSenderForTests: typeof import("./redisRateLimiter").setStoreOutageAlertSenderForTests;
let resetStoreOutageAlertForTests: typeof import("./redisRateLimiter").resetStoreOutageAlertForTests;

beforeEach(async () => {
  vi.resetModules();
  vi.stubEnv("VERCEL", "1");
  state.url = "https://t.upstash.io";
  state.token = "tok";
  state.limit.mockReset();
  state.hset.mockReset().mockResolvedValue(1);
  state.hgetall.mockReset().mockResolvedValue({});
  state.expire.mockReset().mockResolvedValue(1);
  vi.spyOn(console, "error").mockImplementation(() => {});
  ({
    createSharedRateLimiter,
    resetSharedRedisClientForTests,
    setStoreOutageAlertSenderForTests,
    resetStoreOutageAlertForTests,
  } = await import("./redisRateLimiter"));
  // The client and the Ratelimit instances are module singletons shared by every
  // file in this vitest worker; inheriting whichever fake store ran last makes
  // these tests read someone else's state.
  resetSharedRedisClientForTests();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  resetStoreOutageAlertForTests();
  state.isProduction = false;
});

const fallbackResult = {
  ok: true,
  limit: 100,
  remaining: 100,
  reset: Date.now() + 60_000,
};

const fallback = () => ({ record: vi.fn(async () => fallbackResult) });

function requestFrom(ip: string) {
  return new Request("http://localhost:3000/api/test", {
    headers: { "x-vercel-forwarded-for": ip },
  });
}

/** A sliding window that enforces `max` per window, with a little latency. */
function windowStore(max: number, latencyMs = 0) {
  const seen = new Map<string, number>();

  state.limit.mockImplementation(async (key: string) => {
    if (latencyMs) await new Promise((resolve) => setTimeout(resolve, latencyMs));
    const used = (seen.get(key) ?? 0) + 1;
    seen.set(key, used);
    return {
      success: used <= max,
      remaining: Math.max(0, max - used),
      reset: Date.now() + 60_000,
    };
  });
}

describe("rate limiter under contention", () => {
  it("trips a parallel burst at exactly the configured limit", async () => {
    const max = 10;
    windowStore(max, 2);
    const limiter = createSharedRateLimiter("api", max, 60_000, fallback());

    // Fifty callers in flight at once, one bucket: the store must admit exactly
    // ten. An off-by-one here is an attacker's free ten extra requests.
    const results = await Promise.all(
      Array.from({ length: 50 }, () => limiter.record(requestFrom("198.51.100.7")))
    );

    expect(results.filter((result) => result.ok)).toHaveLength(max);
    expect(results.filter((result) => !result.ok)).toHaveLength(50 - max);
  });

  it("keeps separate buckets exact under the same burst", async () => {
    const max = 5;
    windowStore(max, 1);
    const limiter = createSharedRateLimiter("api", max, 60_000, fallback());

    const results = await Promise.all(
      Array.from({ length: 40 }, (_, index) =>
        limiter.record(requestFrom(`198.51.100.${index % 4}`))
      )
    );

    // Four addresses, ten callers each, five admitted per address.
    expect(results.filter((result) => result.ok)).toHaveLength(4 * max);
  });

  it("counts every failure of a concurrent outage exactly once", async () => {
    state.limit.mockRejectedValue(new Error("redis down"));
    const limiter = createSharedRateLimiter("api", 10, 60_000, fallback());

    const results = await Promise.all(
      Array.from({ length: 25 }, () => limiter.record(requestFrom("198.51.100.7")))
    );

    // Every caller is served - fail open - and each one is flagged, not silently
    // permissive.
    expect(results).toHaveLength(25);
    for (const result of results) {
      expect(result.unavailable).toBe(true);
    }

    const counts = await limiter.getErrorCounts(0);
    expect(counts).toEqual([
      { ip: "198.51.100.7", errors: 25, lastErrorAt: expect.any(Number) },
    ]);
  });

  it("never reaches for the in-memory fallback while Redis is down", async () => {
    state.limit.mockRejectedValue(new Error("redis down"));
    const memory = fallback();
    const limiter = createSharedRateLimiter("strict", 10, 60_000, memory);

    await Promise.all(
      Array.from({ length: 5 }, () => limiter.record(requestFrom("198.51.100.7")))
    );

    // The fallback is the per-instance bypass a distributed attacker wants; an
    // outage must surface as `unavailable`, not as a quieter limit.
    expect(memory.record).not.toHaveBeenCalled();
  });
});

describe("rate limiter through an outage and recovery", () => {
  it("enforces again once the store recovers, without a restart", async () => {
    const max = 3;
    windowStore(max);

    // Outage first.
    state.limit.mockRejectedValueOnce(new Error("redis down"));
    const limiter = createSharedRateLimiter("api", max, 60_000, fallback());
    const during = await limiter.record(requestFrom("198.51.100.7"));
    expect(during.unavailable).toBe(true);

    // Recovery: the same instance, no restart, and the window is untouched by
    // the failed call.
    const results = [];
    for (let index = 0; index < max + 1; index += 1) {
      results.push(await limiter.record(requestFrom("198.51.100.7")));
    }

    expect(results.filter((result) => result.ok)).toHaveLength(max);
    expect(results.at(-1)?.ok).toBe(false);
  });

  it("stops reporting the outage once the error window has passed", async () => {
    state.limit.mockRejectedValue(new Error("redis down"));
    const limiter = createSharedRateLimiter("api", 10, 60_000, fallback());

    await limiter.record(requestFrom("198.51.100.7"));
    expect(await limiter.getErrorCounts(0)).toHaveLength(1);

    // Health reads `getErrorCounts(now - 5m)`; five minutes later the same
    // instance must read clean without anyone clearing it.
    const later = Date.now() + 5 * 60 * 1000 + 1;
    expect(await limiter.getErrorCounts(later)).toEqual([]);
  });
});

describe("store-outage escalation", () => {
  /** The webhook URL is read from process.env, so stub it per test. */
  const ALERT_URL = "https://alerts.example.com/hook";

  it("escalates a sustained outage to the operator webhook once, then stays quiet", async () => {
    state.isProduction = true;
    vi.stubEnv("ERROR_ALERT_WEBHOOK_URL", ALERT_URL);

    const sent: unknown[] = [];
    setStoreOutageAlertSenderForTests((payload) => {
      sent.push(payload);
    });

    state.limit.mockRejectedValue(new Error("redis down"));
    const limiter = createSharedRateLimiter("strict", 10, 60_000, fallback());

    // Cross the threshold, then keep failing: one alert, not one per failure.
    for (let i = 0; i < 12; i++) {
      await limiter.record(requestFrom("198.51.100.7"));
    }
    expect(sent).toHaveLength(1);

    const payload = sent[0] as {
      content: string;
      embeds: Array<{ fields: Array<{ name: string; value: string }> }>;
    };
    expect(payload.content).toContain("Rate-limit store outage");
    const limiterField = payload.embeds[0].fields.find(
      (field) => field.name === "Limiter"
    );
    expect(limiterField?.value).toBe("strict");

    // Inside the dedupe window the outage keeps failing without re-paging.
    for (let i = 0; i < 5; i++) {
      await limiter.record(requestFrom("198.51.100.7"));
    }
    expect(sent).toHaveLength(1);
  });

  it("stays quiet while the outage is below the threshold", async () => {
    state.isProduction = true;
    vi.stubEnv("ERROR_ALERT_WEBHOOK_URL", ALERT_URL);

    const sent: unknown[] = [];
    setStoreOutageAlertSenderForTests((payload) => {
      sent.push(payload);
    });

    state.limit.mockRejectedValue(new Error("redis down"));
    const limiter = createSharedRateLimiter("strict", 10, 60_000, fallback());

    for (let i = 0; i < 5; i++) {
      await limiter.record(requestFrom("198.51.100.7"));
    }
    expect(sent).toHaveLength(0);
  });

  it("does not alert outside production", async () => {
    state.isProduction = false;
    vi.stubEnv("ERROR_ALERT_WEBHOOK_URL", ALERT_URL);

    const sent: unknown[] = [];
    setStoreOutageAlertSenderForTests((payload) => {
      sent.push(payload);
    });

    state.limit.mockRejectedValue(new Error("redis down"));
    const limiter = createSharedRateLimiter("strict", 10, 60_000, fallback());

    for (let i = 0; i < 15; i++) {
      await limiter.record(requestFrom("198.51.100.7"));
    }
    expect(sent).toHaveLength(0);
  });

  it("does not alert when no operator webhook is configured", async () => {
    state.isProduction = true;
    // No ERROR_ALERT_WEBHOOK_URL and no ALERT_WEBHOOK_URL: the escalation
    // gate closes and the sender is never reached.
    const sent: unknown[] = [];
    setStoreOutageAlertSenderForTests((payload) => {
      sent.push(payload);
    });

    state.limit.mockRejectedValue(new Error("redis down"));
    const limiter = createSharedRateLimiter("strict", 10, 60_000, fallback());

    for (let i = 0; i < 15; i++) {
      await limiter.record(requestFrom("198.51.100.7"));
    }
    expect(sent).toHaveLength(0);
  });
});
