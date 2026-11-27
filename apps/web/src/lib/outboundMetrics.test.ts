/**
 * Tests for the outbound rejection tracker.
 *
 * The tracker exists so a flood against one recipient — invisible to the
 * recipient, whose messages simply stop arriving — is visible to an operator
 * through /api/health and one deduplicated Discord webhook alert. These tests
 * cover the bucketed counting, the channel breakdown, the spike threshold,
 * the Redis-to-memory fallback, the fire-and-forget contract, and the alert
 * dedupe.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const state = vi.hoisted(() => ({
  redis: null as {
    incrby: ReturnType<typeof vi.fn>;
    expire: ReturnType<typeof vi.fn>;
    get: ReturnType<typeof vi.fn>;
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
  recordOutboundRejection,
  readOutboundRejections,
  reportOutboundSpike,
  resetOutboundMetricsForTests,
  setOutboundAlertSenderForTests,
  buildOutboundAlertPayload,
  resolveOutboundAlertWebhookUrl,
  OUTBOUND_SPIKE_THRESHOLD,
  type OutboundAlertPayload,
} from "./outboundMetrics";

/** Records the payloads the module would POST to Discord. */
const captureAlert = vi.fn<(payload: OutboundAlertPayload) => void>();

/** Five-minute bucket arithmetic, mirroring the module's constants. */
const BUCKET_MS = 5 * 60 * 1000;

/** A base far enough in the past that `Date.now()` never lands inside it. */
const BASE = 1_700_000_000_000;

function bucketAt(offsetBuckets: number, base = BASE): number {
  return base + offsetBuckets * BUCKET_MS;
}

/** The bucket number the module derives from a timestamp. */
function bucketNumber(at: number): number {
  return Math.floor(at / BUCKET_MS);
}

beforeEach(() => {
  state.redis = null;
  resetOutboundMetricsForTests();
  captureAlert.mockClear();
  setOutboundAlertSenderForTests(captureAlert);
});

afterEach(() => {
  resetOutboundMetricsForTests();
  vi.unstubAllEnvs();
});

describe("recordOutboundRejection — in-process fallback", () => {
  it("counts rejections per channel", async () => {
    const now = bucketAt(0);

    recordOutboundRejection("email", now);
    recordOutboundRejection("email", now);
    recordOutboundRejection("whatsapp", now);

    const status = await readOutboundRejections(now);
    expect(status.byChannel).toEqual({ email: 2, whatsapp: 1 });
    expect(status.rejectionsLast10Min).toBe(3);
  });

  it("sums the current bucket and the one before it only", async () => {
    const now = bucketAt(2);

    recordOutboundRejection("email", bucketAt(-1)); // outside the window
    recordOutboundRejection("email", bucketAt(0)); // outside the window
    recordOutboundRejection("email", bucketAt(1)); // previous bucket
    recordOutboundRejection("email", bucketAt(2)); // current bucket

    const status = await readOutboundRejections(now);
    expect(status.byChannel.email).toBe(2);
  });

  it("combines both channels for the spike decision", async () => {
    const now = bucketAt(0);

    for (let index = 0; index < OUTBOUND_SPIKE_THRESHOLD - 1; index += 1) {
      recordOutboundRejection("email", now);
    }
    recordOutboundRejection("whatsapp", now);

    const status = await readOutboundRejections(now);
    expect(status.rejectionsLast10Min).toBe(OUTBOUND_SPIKE_THRESHOLD);
    expect(status.spike).toBe(true);
  });

  it("stays under the spike for isolated refusals", async () => {
    const now = bucketAt(0);

    recordOutboundRejection("email", now);

    const status = await readOutboundRejections(now);
    expect(status.spike).toBe(false);
  });
});

describe("recordOutboundRejection — shared Redis store", () => {
  it("writes one counter per channel and bucket, with the TTL", async () => {
    state.redis = {
      incrby: vi.fn().mockResolvedValue(1),
      expire: vi.fn().mockResolvedValue(1),
      get: vi.fn().mockResolvedValue(null),
    };
    const now = bucketAt(0);
    const bucket = bucketNumber(now);

    recordOutboundRejection("email", now);
    recordOutboundRejection("whatsapp", now);

    // The key names carry the channel and the bucket; the TTL is 30 minutes.
    expect(state.redis.incrby).toHaveBeenCalledWith(
      `shipin:outbound:rejections:email:${bucket}`,
      1
    );
    expect(state.redis.incrby).toHaveBeenCalledWith(
      `shipin:outbound:rejections:whatsapp:${bucket}`,
      1
    );
    expect(state.redis.expire).toHaveBeenCalledWith(
      `shipin:outbound:rejections:email:${bucket}`,
      30 * 60
    );
  });

  it("reads the window's buckets back from the store", async () => {
    const now = bucketAt(0);
    const bucket = bucketNumber(now);
    state.redis = {
      incrby: vi.fn().mockResolvedValue(1),
      expire: vi.fn().mockResolvedValue(1),
      get: vi.fn(async (key: string) => {
        if (key === `shipin:outbound:rejections:email:${bucket}`) return "4";
        if (key === `shipin:outbound:rejections:whatsapp:${bucket}`) return "7";
        return null;
      }),
    };

    const status = await readOutboundRejections(bucketAt(0));
    expect(status.byChannel).toEqual({ email: 4, whatsapp: 7 });
    expect(status.rejectionsLast10Min).toBe(11);
    expect(status.spike).toBe(true);
  });

  it("never throws or delays the caller: a store error is logged only", async () => {
    state.redis = {
      incrby: vi.fn().mockRejectedValue(new Error("redis down")),
      expire: vi.fn().mockRejectedValue(new Error("redis down")),
      get: vi.fn().mockRejectedValue(new Error("redis down")),
    };

    // Fire-and-forget: recording must not reject.
    expect(() => recordOutboundRejection("email", bucketAt(0))).not.toThrow();
    await new Promise((resolve) => setTimeout(resolve, 0));

    // And the read falls back to the local counters, not a false zero.
    recordOutboundRejection("email", bucketAt(0));
    const status = await readOutboundRejections(bucketAt(0));
    expect(status.byChannel.email).toBe(2);
  });
});

describe("outbound spike alert", () => {
  it("fires once per five-minute bucket when the combined count spikes", async () => {
    const now = bucketAt(0);

    for (let index = 0; index < OUTBOUND_SPIKE_THRESHOLD; index += 1) {
      recordOutboundRejection("email", now);
    }
    const status = await readOutboundRejections(now);

    expect(reportOutboundSpike(status, now)).toBe(true);
    expect(captureAlert).toHaveBeenCalledTimes(1);

    // Same bucket: deduplicated. Next bucket: a new outage, a new alert.
    expect(reportOutboundSpike(status, now + 1)).toBe(false);
    expect(reportOutboundSpike(status, now + BUCKET_MS)).toBe(true);
    expect(captureAlert).toHaveBeenCalledTimes(2);
  });

  it("does not fire while the rejections stay under the threshold", async () => {
    const now = bucketAt(0);

    recordOutboundRejection("email", now);
    const status = await readOutboundRejections(now);

    expect(reportOutboundSpike(status, now)).toBe(false);
    expect(captureAlert).not.toHaveBeenCalled();
  });

  it("addresses the App Check alert channel, falling back to the breach channel", () => {
    vi.stubEnv("APP_CHECK_ALERT_WEBHOOK_URL", "https://discord.example/appcheck");
    expect(resolveOutboundAlertWebhookUrl()).toBe(
      "https://discord.example/appcheck"
    );

    vi.stubEnv("APP_CHECK_ALERT_WEBHOOK_URL", "");
    vi.stubEnv("BREACH_ALERT_WEBHOOK_URL", "https://discord.example/breach");
    expect(resolveOutboundAlertWebhookUrl()).toBe(
      "https://discord.example/breach"
    );

    vi.stubEnv("BREACH_ALERT_WEBHOOK_URL", "");
    expect(resolveOutboundAlertWebhookUrl()).toBeNull();
  });

  it("carries the channel breakdown and the fix in the payload", () => {
    const payload = buildOutboundAlertPayload(
      {
        rejectionsLast10Min: 12,
        byChannel: { email: 9, whatsapp: 3 },
        spike: true,
      },
      bucketAt(0)
    );

    expect(payload.content).toContain("12 rate-limited sends");
    const fields = payload.embeds[0].fields;
    expect(fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "Email", value: "9" }),
        expect.objectContaining({ name: "WhatsApp", value: "3" }),
      ])
    );
  });
});
