// @vitest-environment node

/**
 * Structured error tracking.
 *
 * The value of this module is what it refuses to do: throw, duplicate an alert
 * for one incident, or carry a credential into a chat channel. Each of those has
 * a test, because each is a way an error reporter makes an outage worse.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  redis: null as null | {
    hincrby: ReturnType<typeof vi.fn>;
    expire: ReturnType<typeof vi.fn>;
    hgetall: ReturnType<typeof vi.fn>;
    set?: ReturnType<typeof vi.fn>;
  },
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
  buildErrorAlertPayload,
  buildErrorEvent,
  captureServerError,
  fingerprintFor,
  normaliseMessage,
  readErrorCounts,
  resetErrorTrackingForTests,
  resolveErrorAlertWebhook,
  setErrorAlertSenderForTests,
} from "./errorTracking";

beforeEach(() => {
  resetErrorTrackingForTests();
  state.redis = null;
  vi.stubEnv("ERROR_ALERT_WEBHOOK_URL", "https://hooks.test/errors");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("fingerprints", () => {
  it("treats one broken code path as one incident, whatever the ids", () => {
    const first = buildErrorEvent(new Error("Request req_ABC123 failed for user 42"), {
      category: "payment-settlement",
      code: "SETTLEMENT_FAILED",
    });
    const second = buildErrorEvent(
      new Error("Request req_XYZ999 failed for user 77"),
      { category: "payment-settlement", code: "SETTLEMENT_FAILED" }
    );

    expect(first.fingerprint).toBe(second.fingerprint);
  });

  it("separates different failures", () => {
    const a = buildErrorEvent(new Error("amount mismatch"), {
      category: "payment-drift",
      code: "DRIFT",
    });
    const b = buildErrorEvent(new Error("amount mismatch"), {
      category: "payment-drift",
      code: "OTHER",
    });

    expect(a.fingerprint).not.toBe(b.fingerprint);
    expect(fingerprintFor("payment-drift", "DRIFT", "amount mismatch")).toMatch(
      /^payment-drift:[0-9a-f]{16}$/
    );
  });

  it("normalises ids and numbers out of the message", () => {
    expect(normaliseMessage("topup 3f1c0a1e-0000-4000-8000-000000000000 amount 4200")).toBe(
      "topup <uuid> amount <n>"
    );
  });
});

describe("what leaves the process", () => {
  it("redacts anything key-shaped and truncates the rest", () => {
    const event = buildErrorEvent(new Error("boom"), {
      category: "mfa-store",
      context: {
        authorization: "Bearer secret",
        idToken: "abc",
        privateKey: "-----BEGIN",
        requestId: "req-1",
        longValue: "x".repeat(500),
        nested: { deep: "value" },
        count: 2,
      },
    });

    expect(event.context).toMatchObject({
      authorization: "[redacted]",
      idToken: "[redacted]",
      privateKey: "[redacted]",
      requestId: "req-1",
      nested: "[object]",
      count: 2,
    });
    expect(String(event.context.longValue)).toHaveLength(200);
    expect(JSON.stringify(event)).not.toContain("BEGIN");
  });

  it("caps the number of context keys", () => {
    const context = Object.fromEntries(
      Array.from({ length: 30 }, (_, index) => [`key${index}`, index])
    );

    expect(Object.keys(buildErrorEvent(new Error("x"), { category: "unhandled", context }).context))
      .toHaveLength(12);
  });
});

describe("alerting", () => {
  it("sends one structured alert", async () => {
    const sent: Array<{ payload: unknown; url: string }> = [];
    setErrorAlertSenderForTests(async (payload, url) => {
      sent.push({ payload, url });
    });

    await captureServerError(new Error("PayPal and Firestore disagree"), {
      category: "payment-drift",
      severity: "critical",
      code: "PAYMENT_DRIFT",
      context: { requestId: "req-1", drift: 1 },
    });

    expect(sent).toHaveLength(1);
    expect(sent[0].url).toBe("https://hooks.test/errors");
    expect(sent[0].payload).toMatchObject({
      content: expect.stringContaining("Payment drift needs a human"),
      embeds: [
        expect.objectContaining({
          title: "Payment drift needs a human",
          fields: expect.arrayContaining([
            { name: "Code", value: "`PAYMENT_DRIFT`", inline: true },
          ]),
        }),
      ],
    });
  });

  it("pages once for one incident, not once per occurrence", async () => {
    const sender = vi.fn(async () => {});
    setErrorAlertSenderForTests(sender);

    for (let index = 0; index < 5; index += 1) {
      await captureServerError(new Error("revocation store unreachable"), {
        category: "mfa-store",
        code: "MFA_STORE_DOWN",
      });
    }

    expect(sender).toHaveBeenCalledTimes(1);
  });

  it("still alerts per instance when no shared store is configured", async () => {
    const sender = vi.fn(async () => {});
    setErrorAlertSenderForTests(sender);

    await captureServerError(new Error("cron failed"), { category: "cron" });
    await captureServerError(new Error("cron failed"), { category: "cron" });

    expect(sender).toHaveBeenCalledTimes(1);
  });

  it("never throws when the webhook fails", async () => {
    setErrorAlertSenderForTests(async () => {
      throw new Error("discord down");
    });

    await expect(
      captureServerError(new Error("boom"), { category: "unhandled" })
    ).resolves.toBeUndefined();
  });

  it("does nothing but log when no webhook is configured", async () => {
    vi.stubEnv("ERROR_ALERT_WEBHOOK_URL", "");
    vi.stubEnv("ALERT_WEBHOOK_URL", "");
    vi.stubEnv("BREACH_ALERT_WEBHOOK_URL", "");
    const sender = vi.fn(async () => {});
    setErrorAlertSenderForTests(sender);

    expect(resolveErrorAlertWebhook()).toBeNull();
    await captureServerError(new Error("boom"), { category: "unhandled" });

    expect(sender).not.toHaveBeenCalled();
  });

  it("falls back to the breach channel when the dedicated one is unset", () => {
    vi.stubEnv("ERROR_ALERT_WEBHOOK_URL", "");
    vi.stubEnv("ALERT_WEBHOOK_URL", "");
    vi.stubEnv("BREACH_ALERT_WEBHOOK_URL", "https://hooks.test/breach");

    expect(resolveErrorAlertWebhook()).toBe("https://hooks.test/breach");
  });

  it("colours a critical alert differently from a warning", () => {
    const critical = buildErrorAlertPayload(
      buildErrorEvent(new Error("x"), { category: "payment-drift", severity: "critical" })
    );
    const warning = buildErrorAlertPayload(
      buildErrorEvent(new Error("x"), { category: "payment-drift", severity: "warning" })
    );

    expect(critical.embeds[0].color).not.toBe(warning.embeds[0].color);
  });
});

describe("counts for /api/health", () => {
  it("tallies by category and severity from the shared store", async () => {
    const bucket = String(Math.floor(Date.now() / (5 * 60 * 1000)));

    state.redis = {
      hincrby: vi.fn(async () => 1),
      expire: vi.fn(async () => 1),
      hgetall: vi.fn(async () => ({
        [`${bucket}:payment-drift:critical`]: 2,
        [`${bucket}:cron:error`]: 1,
        [`${Number(bucket) - 9}:payment-drift:critical`]: 99,
      })),
    };

    await expect(readErrorCounts()).resolves.toEqual({
      recent: 3,
      byCategory: { "payment-drift": 2, cron: 1 },
      bySeverity: { critical: 2, error: 1 },
    });
  });

  it("counts locally when there is no shared store", async () => {
    await captureServerError(new Error("one"), { category: "mfa-store", code: "A" });
    await captureServerError(new Error("two"), { category: "cron", code: "B" });

    const counts = await readErrorCounts();

    expect(counts.recent).toBe(2);
    expect(counts.byCategory).toEqual({ "mfa-store": 1, cron: 1 });
  });
});
