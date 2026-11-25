/**
 * Tests for the App Check rejection tracker.
 *
 * The tracker exists so a reCAPTCHA quota outage — where every client's
 * attestation starts failing at once — is visible to an operator through
 * /api/health and one deduplicated Discord webhook alert, instead of only
 * per-user banners. These tests cover the counting window, the spike
 * threshold, the Redis-to-memory fallback, the alert dedupe, and the webhook
 * payload and its failure handling.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

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
  buildAppCheckAlertPayload,
  dispatchAppCheckAlert,
  getAppCheckAlertTarget,
  resolveAppCheckAlertWebhookUrl,
  APP_CHECK_SPIKE_THRESHOLD,
  type AppCheckAlertPayload,
} from "./appCheckMetrics";

/** Records the payloads the module would POST to Discord. */
const captureAlert = vi.fn<(payload: AppCheckAlertPayload) => void>();

/** Five-minute bucket arithmetic, mirroring the module's constants. */
const BUCKET_MS = 5 * 60 * 1000;

function bucketAt(offsetBuckets: number, base = 1_700_000_000_000): number {
  return base + offsetBuckets * BUCKET_MS;
}

/** The bucket index the module derives from a timestamp. */
function bucketIndex(timestamp: number): string {
  return String(Math.floor(timestamp / BUCKET_MS));
}

const originalEnv = { ...process.env };

beforeEach(() => {
  resetAppCheckMetricsForTests();
  captureAlert.mockReset();
  setAppCheckAlertSenderForTests(captureAlert);
  state.redis = null;
  delete process.env.APP_CHECK_ALERT_WEBHOOK_URL;
  delete process.env.BREACH_ALERT_WEBHOOK_URL;
});

afterEach(() => {
  for (const key of [
    "APP_CHECK_ALERT_WEBHOOK_URL",
    "BREACH_ALERT_WEBHOOK_URL",
    "VERCEL_ENV",
  ]) {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  }
  vi.unstubAllGlobals();
});

describe("recordAppCheckRejection / readAppCheckRejections", () => {
  it("counts rejections in memory when no shared store is configured", async () => {
    const now = bucketAt(0);
    recordAppCheckRejection("invalid", now);
    recordAppCheckRejection("invalid", now + 1000);

    const status = await readAppCheckRejections(now + 2000);
    expect(status.recentRejections).toBe(2);
    expect(status.spike).toBe(false);
  });

  it("marks a spike once the window total crosses the threshold", async () => {
    const now = bucketAt(0);
    for (let i = 0; i < APP_CHECK_SPIKE_THRESHOLD; i += 1) {
      recordAppCheckRejection("invalid", now + i);
    }

    const status = await readAppCheckRejections(now + BUCKET_MS);
    expect(status.recentRejections).toBe(APP_CHECK_SPIKE_THRESHOLD);
    expect(status.spike).toBe(true);
  });

  it("forgets buckets older than the ten-minute window", async () => {
    const old = bucketAt(-3); // two buckets before the window starts
    recordAppCheckRejection("invalid", old);
    recordAppCheckRejection("invalid", old + 1);
    recordAppCheckRejection("invalid", old + 2);

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
    recordAppCheckRejection("invalid", now);
    state.redis = {
      hincrby: vi.fn().mockResolvedValue(1),
      expire: vi.fn().mockResolvedValue(1),
      hgetall: vi.fn().mockRejectedValue(new Error("store down")),
    };

    const status = await readAppCheckRejections(now);
    // A store outage must not read as a false zero.
    expect(status.recentRejections).toBe(1);
  });

  it("reports why requests were refused, not just how many", async () => {
    // "missing" is a browser that could not mint a token; "invalid" is a key or
    // project that does not match. The fixes are opposite, so a bare total is
    // not enough to act on.
    const now = bucketAt(0);
    recordAppCheckRejection("missing", now);
    recordAppCheckRejection("missing", now);
    recordAppCheckRejection("invalid", now);

    const status = await readAppCheckRejections(now);
    expect(status.recentRejections).toBe(3);
    expect(status.missing).toBe(2);
    expect(status.invalid).toBe(1);
  });

  it("writes the reason alongside the total", async () => {
    const hincrby = vi.fn().mockResolvedValue(1);
    state.redis = { hincrby, expire: vi.fn().mockResolvedValue(1), hgetall: vi.fn().mockResolvedValue({}) };

    recordAppCheckRejection("missing", bucketAt(0));
    await Promise.resolve();
    await Promise.resolve();

    expect(hincrby).toHaveBeenCalledWith(
      "shipin:appcheck:rejection-reasons",
      expect.stringMatching(/:missing$/),
      1
    );
  });

  it("writes rejections through to the shared store when configured", async () => {
    const hincrby = vi.fn().mockResolvedValue(1);
    const expire = vi.fn().mockResolvedValue(1);
    state.redis = {
      hincrby,
      expire,
      hgetall: vi.fn().mockResolvedValue({}),
    };

    recordAppCheckRejection("invalid", bucketAt(0));
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

describe("failure reason storage", () => {
  it("keeps a label that contains the field separator", async () => {
    // The label is free-form ("unrecognized|<code>|<message>") and was stored
    // as `bucket:label`. Splitting on every colon truncated it to its first
    // word, so a diagnostic meant to end the guessing printed nothing useful.
    const bucket = String(Math.floor(Date.now() / 5 / 60 / 1000));
    const label = "unrecognized|no-code|The provided App Check token is invalid.";

    state.redis = {
      hincrby: vi.fn().mockResolvedValue(1),
      expire: vi.fn().mockResolvedValue(1),
      hgetall: vi.fn(async (key: string) =>
        key === "shipin:appcheck:invalid-details"
          ? { [`${bucket}:${label}`]: 2 }
          : {}
      ),
    };

    const status = await readAppCheckRejections(Date.now());

    expect(status.invalidReasons[label]).toBe(2);
  });
});

describe("reportAppCheckSpike", () => {
  it("alerts once per bucket and not again for the same window", () => {
    const status = { recentRejections: 50, spike: true, missing: 0, invalid: 0, invalidReasons: {} };

    expect(reportAppCheckSpike(status, bucketAt(0))).toBe(true);
    expect(captureAlert).toHaveBeenCalledTimes(1);

    // Health probes poll every few seconds: the same window must not re-alert.
    expect(reportAppCheckSpike(status, bucketAt(0) + 5000)).toBe(false);
    expect(captureAlert).toHaveBeenCalledTimes(1);
  });

  it("alerts again only when a new bucket spikes", () => {
    const status = { recentRejections: 50, spike: true, missing: 0, invalid: 0, invalidReasons: {} };
    reportAppCheckSpike(status, bucketAt(0));

    expect(reportAppCheckSpike(status, bucketAt(1))).toBe(true);
    expect(captureAlert).toHaveBeenCalledTimes(2);
  });

  it("stays silent below the threshold", () => {
    expect(
      reportAppCheckSpike({ recentRejections: 3, spike: false, missing: 0, invalid: 0, invalidReasons: {} }, bucketAt(0))
    ).toBe(false);
    expect(captureAlert).not.toHaveBeenCalled();
  });
});

describe("buildAppCheckAlertPayload", () => {
  it("carries the title, the count, the threshold and a timestamp", () => {
    const now = bucketAt(0);
    const payload = buildAppCheckAlertPayload(
      { recentRejections: 42, spike: true, missing: 0, invalid: 0, invalidReasons: {} },
      now
    );

    expect(payload.content).toContain("App Check Rejection Spike Detected");
    expect(payload.content).toContain("42");

    const [embed] = payload.embeds;
    expect(embed.title).toBe("App Check Rejection Spike Detected");
    expect(embed.timestamp).toBe(new Date(now).toISOString());
    expect(embed.fields).toContainEqual({
      name: "Rejections (10 min)",
      value: "42",
      inline: true,
    });
    expect(embed.fields).toContainEqual({
      name: "Spike threshold",
      value: String(APP_CHECK_SPIKE_THRESHOLD),
      inline: true,
    });
  });

  it("names the deployment environment from VERCEL_ENV when present", () => {
    process.env.VERCEL_ENV = "production";
    const payload = buildAppCheckAlertPayload(
      { recentRejections: 30, spike: true, missing: 0, invalid: 0, invalidReasons: {} },
      bucketAt(0)
    );

    expect(payload.embeds[0].fields).toContainEqual({
      name: "Environment",
      value: "production",
      inline: true,
    });
    expect(payload.content).toContain("production");
  });

  it("reminds the on-call of the escape hatch", () => {
    const payload = buildAppCheckAlertPayload(
      { recentRejections: 99, spike: true, missing: 0, invalid: 0, invalidReasons: {} },
      bucketAt(0)
    );
    const remediation = payload.embeds[0].fields.find(
      (field) => field.name === "Remediation"
    );

    expect(remediation?.value).toContain("APP_CHECK_ENFORCEMENT=false");
    expect(remediation?.value).toContain("redeploy");
  });
});

describe("resolveAppCheckAlertWebhookUrl", () => {
  it("prefers the dedicated App Check webhook", () => {
    process.env.APP_CHECK_ALERT_WEBHOOK_URL = "https://discord.test/appcheck";
    process.env.BREACH_ALERT_WEBHOOK_URL = "https://discord.test/breach";

    expect(resolveAppCheckAlertWebhookUrl()).toBe(
      "https://discord.test/appcheck"
    );
  });

  it("falls back to the breach webhook when the dedicated one is unset", () => {
    process.env.BREACH_ALERT_WEBHOOK_URL = "https://discord.test/breach";

    expect(resolveAppCheckAlertWebhookUrl()).toBe("https://discord.test/breach");
  });

  it("returns null when neither variable is configured", () => {
    // Alerting is optional: an unconfigured deployment must no-op, not throw.
    expect(resolveAppCheckAlertWebhookUrl()).toBeNull();
  });
});

describe("getAppCheckAlertTarget", () => {
  it("names the dedicated channel when both are configured", () => {
    process.env.APP_CHECK_ALERT_WEBHOOK_URL = "https://discord.test/appcheck";
    process.env.BREACH_ALERT_WEBHOOK_URL = "https://discord.test/breach";

    expect(getAppCheckAlertTarget()).toEqual({
      configured: true,
      source: "dedicated",
    });
  });

  it("falls back to the breach channel and reports none when unset", () => {
    process.env.BREACH_ALERT_WEBHOOK_URL = "https://discord.test/breach";
    expect(getAppCheckAlertTarget()).toEqual({
      configured: true,
      source: "breach",
    });

    delete process.env.BREACH_ALERT_WEBHOOK_URL;
    expect(getAppCheckAlertTarget()).toEqual({
      configured: false,
      source: "none",
    });
  });

  it("treats a blank value as unset rather than configured", () => {
    process.env.APP_CHECK_ALERT_WEBHOOK_URL = "   ";

    expect(getAppCheckAlertTarget().source).toBe("none");
  });
});

describe("dispatchAppCheckAlert", () => {
  const payload = buildAppCheckAlertPayload(
    { recentRejections: 25, spike: true, missing: 0, invalid: 0, invalidReasons: {} },
    1_700_000_000_000
  );

  it("POSTs the payload as JSON with a bounded timeout", async () => {
    process.env.APP_CHECK_ALERT_WEBHOOK_URL = "https://discord.test/hook";
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 204 });
    vi.stubGlobal("fetch", fetchMock);

    await dispatchAppCheckAlert(payload);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://discord.test/hook");
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ "content-type": "application/json" });
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(JSON.parse(init.body)).toEqual(payload);
  });

  it("does nothing when no webhook is configured", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await dispatchAppCheckAlert(payload);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("swallows a failing webhook so the health probe still answers", async () => {
    process.env.APP_CHECK_ALERT_WEBHOOK_URL = "https://discord.test/hook";
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("timeout")));

    // Resolving is the assertion: this must never throw into /api/health.
    await expect(dispatchAppCheckAlert(payload)).resolves.toBeUndefined();
  });

  it("swallows a non-2xx response", async () => {
    process.env.APP_CHECK_ALERT_WEBHOOK_URL = "https://discord.test/hook";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 429 })
    );

    await expect(dispatchAppCheckAlert(payload)).resolves.toBeUndefined();
  });

  it("is wired as the default sender that reportAppCheckSpike dispatches", async () => {
    // Reset the injected recorder so the real default sender path runs.
    resetAppCheckMetricsForTests();
    process.env.APP_CHECK_ALERT_WEBHOOK_URL = "https://discord.test/hook";
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 204 });
    vi.stubGlobal("fetch", fetchMock);

    expect(reportAppCheckSpike({ recentRejections: 40, spike: true, missing: 0, invalid: 0, invalidReasons: {} }, bucketAt(0)))
      .toBe(true);

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock.mock.calls[0][0]).toBe("https://discord.test/hook");
  });
});
