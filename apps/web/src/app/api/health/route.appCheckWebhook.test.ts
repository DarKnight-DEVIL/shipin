/**
 * Probe-level test for App Check alerting.
 *
 * `route.test.ts` stubs `@/lib/appCheckMetrics` so it can shape the counters
 * per case. This file does the opposite — it runs the real tracker behind
 * `GET /api/health` with a stubbed `fetch`, which is the only way to prove
 * that a spiking deployment actually POSTs a Discord payload with the numbers
 * and the remediation, once per window, and that a broken webhook cannot turn
 * the readiness probe into a failure.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const state = vi.hoisted(() => ({
  isProduction: true,
}));

vi.mock("@/config/env", () => ({
  get isProduction() {
    return state.isProduction;
  },
  clientEnv: {
    get NEXT_PUBLIC_FIREBASE_APP_CHECK_SITE_KEY() {
      return "site-key";
    },
  },
  serverEnv: {
    get UPSTASH_REDIS_REST_URL() {
      return "https://t.upstash.io";
    },
    get UPSTASH_REDIS_REST_TOKEN() {
      return "tok";
    },
    get INDIA_POST_TRACKING_URL() {
      return "https://tracking.example";
    },
    get INDIA_POST_CLIENT_ID() {
      return "client";
    },
    get INDIA_POST_CLIENT_SECRET() {
      return "secret";
    },
  },
}));

vi.mock("@/lib/rateLimiter", () => {
  const makeLimiter = () => ({ record: vi.fn(), getErrorCounts: () => [] });
  return {
    webRateLimiter: makeLimiter(),
    apiRateLimiter: makeLimiter(),
    strictRateLimiter: makeLimiter(),
    loginRateLimiter: makeLimiter(),
  };
});

vi.mock("@/lib/redisRateLimiter", () => ({
  RATE_LIMIT_ERROR_WINDOW_MS: 5 * 60 * 1000,
  getRateLimitStoreStatus: () => ({ configured: true, degraded: false }),
  /** The E2E switch is off; these tests are about the App Check channel. */
  isRateLimitingDisabled: () => false,
  /** No store here, so the tracker uses its in-memory counters: no network. */
  getSharedRedisClient: () => null,
}));

import { GET } from "./route";
import {
  recordAppCheckRejection,
  resetAppCheckMetricsForTests,
  APP_CHECK_SPIKE_THRESHOLD,
} from "@/lib/appCheckMetrics";

const WEBHOOK = "https://discord.test/hook";

const originalEnv = { ...process.env };

beforeEach(() => {
  state.isProduction = true;
  resetAppCheckMetricsForTests();
  process.env.APP_CHECK_ALERT_WEBHOOK_URL = WEBHOOK;
});

afterEach(() => {
  for (const key of ["APP_CHECK_ALERT_WEBHOOK_URL", "BREACH_ALERT_WEBHOOK_URL"]) {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  }
  vi.unstubAllGlobals();
});

describe("GET /api/health with a real App Check spike", () => {
  it("POSTs the Discord payload once and still answers 200", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 204 });
    vi.stubGlobal("fetch", fetchMock);

    for (let i = 0; i < APP_CHECK_SPIKE_THRESHOLD + 3; i += 1) {
      recordAppCheckRejection("invalid");
    }

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe("degraded");
    expect(body.appCheck.rejectionsLast10Min).toBeGreaterThanOrEqual(
      APP_CHECK_SPIKE_THRESHOLD
    );
    expect(body.appCheck.warning).toMatch(/APP_CHECK_ENFORCEMENT=false/);
    expect(body.appCheckSpikeAlerted).toBe(true);

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(WEBHOOK);
    expect(init.method).toBe("POST");
    expect(init.signal).toBeInstanceOf(AbortSignal);

    const payload = JSON.parse(init.body);
    expect(payload.content).toContain("App Check Rejection Spike Detected");
    const [embed] = payload.embeds;
    expect(embed.title).toBe("App Check Rejection Spike Detected");
    expect(embed.timestamp).toBe(new Date(embed.timestamp).toISOString());
    expect(embed.fields).toContainEqual({
      name: "Rejections (10 min)",
      value: String(body.appCheck.rejectionsLast10Min),
      inline: true,
    });
    expect(embed.fields).toContainEqual({
      name: "Spike threshold",
      value: String(APP_CHECK_SPIKE_THRESHOLD),
      inline: true,
    });
    expect(
      embed.fields.find((field: { name: string }) => field.name === "Remediation")
        .value
    ).toContain("APP_CHECK_ENFORCEMENT=false");

    // A second poll inside the same window must not page anyone again.
    const second = await GET();
    expect(second.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("stays degraded but silent when no webhook is configured", async () => {
    delete process.env.APP_CHECK_ALERT_WEBHOOK_URL;
    delete process.env.BREACH_ALERT_WEBHOOK_URL;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    for (let i = 0; i < APP_CHECK_SPIKE_THRESHOLD; i += 1) {
      recordAppCheckRejection("invalid");
    }

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe("degraded");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("answers the probe when the webhook itself fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("discord down")));

    for (let i = 0; i < APP_CHECK_SPIKE_THRESHOLD; i += 1) {
      recordAppCheckRejection("invalid");
    }

    const response = await GET();
    const body = await response.json();

    // The probe reports the outage regardless of whether the alert landed.
    expect(response.status).toBe(200);
    expect(body.status).toBe("degraded");
    expect(body.appCheckSpikeAlerted).toBe(true);
  });
});
