/**
 * Tests for GET /api/health.
 *
 * The route is the readiness probe used by uptime monitors, so its status
 * codes matter as much as its body: a production deployment without a shared
 * rate-limit store still serves traffic, so it reports 200 with a `degraded`
 * status and a warning rather than claiming the deployment is down.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const state = vi.hoisted(() => ({
  isProduction: false,
  url: "",
  token: "",
  appCheckSiteKey: "",
  appCheckEnforcement: "",
  appUrl: "https://shipin.app",
  indiaPostUrl: "",
  indiaPostClientId: "",
  indiaPostClientSecret: "",
  appCheckRejections: 0,
  appCheckSpike: false,
  alertSent: false,
  alertSource: "none" as "dedicated" | "breach" | "none",
  outboundRejections: 0,
  outboundSpike: false,
  outboundAlerted: false,
  errors: { web: 0, api: 0, strict: 0, login: 0 } as Record<string, number>,
}));

vi.mock("@/config/env", () => ({
  get isProduction() {
    return state.isProduction;
  },
  clientEnv: {
    get NEXT_PUBLIC_FIREBASE_APP_CHECK_SITE_KEY() {
      return state.appCheckSiteKey;
    },
  },
  serverEnv: {
    get APP_URL() {
      return state.appUrl;
    },
    get UPSTASH_REDIS_REST_URL() {
      return state.url;
    },
    get UPSTASH_REDIS_REST_TOKEN() {
      return state.token;
    },
    get INDIA_POST_TRACKING_URL() {
      return state.indiaPostUrl;
    },
    get INDIA_POST_CLIENT_ID() {
      return state.indiaPostClientId;
    },
    get INDIA_POST_CLIENT_SECRET() {
      return state.indiaPostClientSecret;
    },
  },
}));

/**
 * Stub the enforcement switch rather than importing the real module.
 *
 * Suites share one module registry (`isolate: false`), so importing the real
 * `@/lib/appCheck` here would cache it bound to this file's env stub and break
 * `appCheck.test.ts`, which asserts the real env coupling. That wiring is
 * covered there; this file only checks how the route reports it.
 */
vi.mock("@/lib/appCheck", () => ({
  isAppCheckEnforced: () => state.appCheckEnforcement === "true",
  // Mirrors the real mapping closely enough for this file's purpose: how the
  // route *reports* the status, not how the status is derived (appCheck.test.ts
  // covers that against the real env module).
  getAppCheckStatus: () => {
    const configured = Boolean(state.appCheckSiteKey);
    const enforced = state.appCheckEnforcement === "true";

    return {
      configured,
      enforced,
      status: enforced
        ? configured
          ? "enforced"
          : "misconfigured"
        : configured
          ? "configured"
          : "disabled",
    } as const;
  },
}));

/**
 * Stub the rejection tracker: the real module would open a Redis client from
 * the env stub above and put a network call behind a unit test. The tracker's
 * own thresholds and dedupe are covered in appCheckMetrics.test.ts; this file
 * only checks how the route reports them.
 */
vi.mock("@/lib/appCheckMetrics", () => ({
  readAppCheckRejections: async () => ({
    recentRejections: state.appCheckRejections,
    spike: state.appCheckSpike,
    missing: state.appCheckRejections,
    invalid: 0,
  }),
  reportAppCheckSpike: () => {
    state.alertSent = state.appCheckSpike;
    return state.appCheckSpike;
  },
  getAppCheckAlertTarget: () => ({
    configured: state.alertSource !== "none",
    source: state.alertSource,
  }),
}));

vi.mock("@/lib/outboundMetrics", () => ({
  readOutboundRejections: async () => ({
    rejectionsLast10Min: state.outboundRejections,
    byChannel: { email: state.outboundRejections, whatsapp: 0 },
    spike: state.outboundSpike,
  }),
  reportOutboundSpike: () => {
    state.outboundAlerted = state.outboundSpike;
    return state.outboundSpike;
  },
}));

vi.mock("@/lib/rateLimiter", () => {
  const makeLimiter = (name: string) => ({
    record: vi.fn(),
    getErrorCounts: () => {
      const errors = state.errors[name] ?? 0;
      return errors > 0
        ? [{ ip: "203.0.113.5", errors, lastErrorAt: Date.now() }]
        : [];
    },
  });

  return {
    webRateLimiter: makeLimiter("web"),
    apiRateLimiter: makeLimiter("api"),
    strictRateLimiter: makeLimiter("strict"),
    loginRateLimiter: makeLimiter("login"),
  };
});

vi.mock("@/lib/redisRateLimiter", () => ({
  // errorTracking reads the shared store for error counts; no store in these tests.
  getSharedRedisClient: () => null,
  RATE_LIMIT_ERROR_WINDOW_MS: 5 * 60 * 1000,
  /**
   * Mirrors the real helper: a store is usable only when the URL parses as
   * https and a token is set. The route has to report *this*, not
   * `Boolean(url)` — the "set but unusable URL" case below is exactly where
   * the two disagree, and it is where the limiter returns `unavailable` on
   * every call while a truthiness check would keep answering `healthy`.
   */
  getRateLimitStoreStatus: () => {
    const configured = /^https:\/\/\S+$/.test(state.url) && Boolean(state.token);
    return { configured, degraded: state.isProduction && !configured };
  },
}));

import { GET } from "./route";

beforeEach(() => {
  state.isProduction = false;
  state.url = "";
  state.token = "";
  state.appCheckSiteKey = "";
  state.appCheckEnforcement = "";
  // A production deployment that boots has APP_URL: it is in PRODUCTION_REQUIRED_ENV.
  state.appUrl = "https://shipin.app";
  state.indiaPostUrl = "";
  state.indiaPostClientId = "";
  state.indiaPostClientSecret = "";
  state.appCheckRejections = 0;
  state.appCheckSpike = false;
  state.alertSent = false;
  state.alertSource = "none";
  state.outboundRejections = 0;
  state.outboundSpike = false;
  state.outboundAlerted = false;
  state.errors = { web: 0, api: 0, strict: 0, login: 0 };
});

describe("GET /api/health", () => {
  it("reports the MFA revocation list, so a bypass is never silent", async () => {
    const response = await GET();
    const body = await response.json();

    /*
     * `degraded: true` here would mean elevation sessions are being accepted without a
     * revocation check, which is the one state where a revoked admin keeps working. It
     * has to be readable from a probe, not only from a log line.
     */
    expect(body.mfaDenylist).toMatchObject({
      mode: "closed",
      degraded: false,
      consecutiveFailures: 0,
    });
    expect(body.mfaDenylist.degradedAccepts).toEqual(expect.any(Number));
  });

  it("reports healthy with the in-memory fallback in development", async () => {
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe("healthy");
    expect(body.redis.configured).toBe(false);
    expect(body.redis.status).toContain("fallback");
    expect(body.checkedAt).toEqual(expect.any(String));
  });

  it("reports degraded with 200 when production has no shared store", async () => {
    state.isProduction = true;

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe("degraded");
    expect(body.redis.configured).toBe(false);
    expect(body.redis.status).toBe("missing");
    expect(body.warning).toContain("UPSTASH_REDIS_REST_URL");
  });

  it("reports healthy when production has Redis and no limiter errors", async () => {
    state.isProduction = true;
    state.url = "https://t.upstash.io";
    state.token = "tok";
    // The carrier feed counts toward health too: a fully configured
    // deployment must not read as degraded just because tracking is live.
    state.indiaPostUrl = "https://tracking.example";
    state.indiaPostClientId = "client";
    state.indiaPostClientSecret = "secret";

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe("healthy");
    expect(body.redis.status).toBe("connected");
    expect(body.tracking).toEqual({ configured: true, status: "india-post" });
  });

  it("reports degraded and alerts once when App Check rejections spike", async () => {
    // The reCAPTCHA quota is exhausted: clients cannot mint App Check tokens,
    // so every API call is rejected even though sign-in still works. The probe
    // has to say degraded or the outage is invisible to monitoring.
    state.isProduction = true;
    state.url = "https://t.upstash.io";
    state.token = "tok";
    state.indiaPostUrl = "https://tracking.example";
    state.indiaPostClientId = "client";
    state.indiaPostClientSecret = "secret";
    state.appCheckSiteKey = "site-key";
    state.appCheckEnforcement = "true";
    state.appCheckRejections = 40;
    state.appCheckSpike = true;

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe("degraded");
    expect(body.appCheck.rejectionsLast10Min).toBe(40);
    expect(body.appCheck.warning).toMatch(/APP_CHECK_ENFORCEMENT=false/);
    expect(body.appCheckSpikeAlerted).toBe(true);
  });

  it("stays healthy when App Check rejections are ordinary background noise", async () => {
    state.isProduction = true;
    state.url = "https://t.upstash.io";
    state.token = "tok";
    state.indiaPostUrl = "https://tracking.example";
    state.indiaPostClientId = "client";
    state.indiaPostClientSecret = "secret";
    state.appCheckRejections = 2;
    state.appCheckSpike = false;

    const response = await GET();
    const body = await response.json();

    expect(body.status).toBe("healthy");
    expect(body.appCheck.rejectionsLast10Min).toBe(2);
    // Why it refused, not just how often: a state written before this existed
    // could not tell a browser that cannot mint a token from keys that disagree.
    expect(body.appCheck.rejectionsMissingToken).toBe(2);
    expect(body.appCheck.rejectionsInvalidToken).toBe(0);
    expect(body.appCheck.warning).toBeUndefined();
    expect(body.appCheckSpikeAlerted).toBeUndefined();
  });

  it("reports degraded and alerts once when outbound rejections spike", async () => {
    // A flood against one recipient is invisible to the recipient — the
    // messages just stop arriving — so the probe is the only signal.
    state.isProduction = true;
    state.url = "https://t.upstash.io";
    state.token = "tok";
    state.indiaPostUrl = "https://tracking.example";
    state.indiaPostClientId = "client";
    state.indiaPostClientSecret = "secret";
    state.outboundRejections = 25;
    state.outboundSpike = true;

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe("degraded");
    expect(body.outbound).toEqual({
      rejectionsLast10Min: 25,
      byChannel: { email: 25, whatsapp: 0 },
      spike: true,
      warning: expect.stringContaining("OUTBOUND_RATE_LIMITED"),
    });
    expect(body.outboundSpikeAlerted).toBe(true);
  });

  it("stays healthy when outbound rejections are ordinary background noise", async () => {
    state.isProduction = true;
    state.url = "https://t.upstash.io";
    state.token = "tok";
    state.indiaPostUrl = "https://tracking.example";
    state.indiaPostClientId = "client";
    state.indiaPostClientSecret = "secret";
    state.outboundRejections = 1;
    state.outboundSpike = false;

    const response = await GET();
    const body = await response.json();

    expect(body.status).toBe("healthy");
    expect(body.outbound).toEqual({
      rejectionsLast10Min: 1,
      byChannel: { email: 1, whatsapp: 0 },
      spike: false,
    });
    expect(body.outboundSpikeAlerted).toBeUndefined();
  });

  it("publishes the alert channel a spike would use", async () => {
    state.isProduction = true;
    state.url = "https://t.upstash.io";
    state.token = "tok";
    state.indiaPostUrl = "https://tracking.example";
    state.indiaPostClientId = "client";
    state.indiaPostClientSecret = "secret";
    state.alertSource = "dedicated";

    const body = await (await GET()).json();

    expect(body.alerting).toEqual({ webhook: "dedicated" });
  });

  it("warns when production has no way to page anyone", async () => {
    // Not a degraded state on its own — the app serves fine — but a monitor
    // that only reads `status` would never learn about a quota outage, so the
    // gap is published explicitly.
    state.isProduction = true;
    state.url = "https://t.upstash.io";
    state.token = "tok";
    state.indiaPostUrl = "https://tracking.example";
    state.indiaPostClientId = "client";
    state.indiaPostClientSecret = "secret";
    state.alertSource = "none";

    const body = await (await GET()).json();

    expect(body.status).toBe("healthy");
    expect(body.alerting.webhook).toBe("none");
    expect(body.alerting.warning).toContain("APP_CHECK_ALERT_WEBHOOK_URL");
  });

  it("reports degraded when production tracking serves the placeholder feed", async () => {    state.isProduction = true;
    state.url = "https://t.upstash.io";
    state.token = "tok";
    state.indiaPostUrl = "https://tracking.example";
    // A partial credential set falls back to the placeholder feed: the app
    // keeps serving, but the probe must say degraded so monitoring sees it.
    state.indiaPostClientId = "";
    state.indiaPostClientSecret = "";

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe("degraded");
    expect(body.tracking).toEqual({
      configured: false,
      status: "placeholder",
    });
    expect(body.trackingWarning).toMatch(/placeholder feed/);
  });

  it("reports degraded when the shared store URL is set but unusable", async () => {
    // A non-https URL means the limiter never creates a Ratelimit instance:
    // rate limits are off, so a probe answering `healthy` here hides an
    // unmetered deployment from uptime monitoring.
    state.isProduction = true;
    state.url = "http://insecure.example";
    state.token = "tok";

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe("degraded");
    expect(body.redis.configured).toBe(false);
    expect(body.redis.status).toBe("missing");
  });

  it("reports App Check as disabled when neither switch is set", async () => {
    const response = await GET();
    const body = await response.json();

    expect(body.appCheck).toEqual({
      configured: false,
      enforced: false,
      status: "disabled",
      rejectionsLast10Min: 0,
      rejectionsMissingToken: 0,
      rejectionsInvalidToken: 0,
    });
  });

  it("reports App Check as configured when only the site key is set", async () => {
    state.appCheckSiteKey = "site-key";

    const response = await GET();
    const body = await response.json();

    expect(body.appCheck).toEqual({
      configured: true,
      enforced: false,
      status: "configured",
      rejectionsLast10Min: 0,
      rejectionsMissingToken: 0,
      rejectionsInvalidToken: 0,
    });
  });

  it("reports App Check as enforced when both switches are set", async () => {
    state.appCheckSiteKey = "site-key";
    state.appCheckEnforcement = "true";

    const response = await GET();
    const body = await response.json();

    expect(body.appCheck).toEqual({
      configured: true,
      enforced: true,
      status: "enforced",
      rejectionsLast10Min: 0,
      rejectionsMissingToken: 0,
      rejectionsInvalidToken: 0,
    });
    expect(body.appCheck.warning).toBeUndefined();
  });

  it("reports enforcement without a site key as misconfigured and degraded", async () => {
    state.appCheckEnforcement = "true";

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.appCheck).toEqual({
      configured: false,
      enforced: true,
      status: "misconfigured",
      rejectionsLast10Min: 0,
      rejectionsMissingToken: 0,
      rejectionsInvalidToken: 0,
      warning: expect.stringContaining("APP_CHECK_FAILED"),
    });
    // Healthy here would hide a deployment that rejects every browser request.
    expect(body.status).toBe("degraded");
  });

  it("stays healthy when App Check is enforced and configured", async () => {
    state.appCheckSiteKey = "site-key";
    state.appCheckEnforcement = "true";

    const response = await GET();
    const body = await response.json();

    // The control for the test above: correct App Check setup must not degrade
    // the report, or the alert is noise nobody reads.
    expect(body.status).toBe("healthy");
    expect(body.appCheck.status).toBe("enforced");
  });

  it("reports degraded counters when Redis is failing", async () => {
    state.isProduction = true;
    state.url = "https://t.upstash.io";
    state.token = "tok";
    state.errors.api = 3;

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe("degraded");
    expect(body.rateLimits.totalRecentErrors).toBe(3);
    expect(body.rateLimits.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "api",
          recentErrors: 3,
          affectedClients: 1,
          lastErrorAt: expect.any(String),
        }),
      ])
    );
    expect(body.rateLimits.warning).toEqual(
      expect.stringContaining("not being enforced")
    );
  });

  it("never publishes the client addresses behind a limiter error", async () => {
    // The probe is unauthenticated: a per-address row here would hand out a
    // list of live user IPs. The limiter mock returns `203.0.113.5`, so any
    // surface that still carries the address shows up as a literal match.
    state.isProduction = true;
    state.url = "https://t.upstash.io";
    state.token = "tok";
    state.errors.api = 3;
    state.errors.web = 1;

    const response = await GET();
    const body = await response.json();

    expect(JSON.stringify(body)).not.toContain("203.0.113.5");
    expect(body.redisErrorDetails).toBeUndefined();
  });
});
