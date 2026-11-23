import { describe, it, expect, vi, beforeEach } from "vitest";

const state = vi.hoisted(() => ({
  doc: undefined as Record<string, unknown> | undefined,
  writes: [] as Array<{ value: Record<string, unknown> }>,
  readError: null as Error | null,
}));

/**
 * The Redis mirror the module keeps next to the Firestore counter. Disabled by
 * default so the existing cases exercise the "no mirror configured" path; the
 * last group enables it to pin the mirror behaviour itself.
 */
const mirror = vi.hoisted(() => ({
  enabled: false,
  get: vi.fn<(key: string) => Promise<string | null>>(),
  set: vi.fn<(key: string, value: string) => Promise<unknown>>(),
}));

vi.mock("./redisRateLimiter", () => ({
  getSharedRedisClient: () =>
    mirror.enabled ? { get: mirror.get, set: mirror.set } : null,
}));

vi.mock("firebase-admin/firestore", () => ({
  FieldValue: {
    serverTimestamp: () => "__SERVER_TS__",
    delete: () => "__DELETE__",
  },
}));

vi.mock("@/lib/firebaseAdmin", () => ({
  adminDb: {
    collection: (name: string) => ({
      doc: (id: string) => ({
        path: `${name}/${id}`,
        get: async () => {
          if (state.readError) throw state.readError;
          return { exists: state.doc !== undefined, data: () => state.doc };
        },
        set: async (value: Record<string, unknown>) => {
          state.writes.push({ value });
          state.doc = { ...(state.doc ?? {}), ...value };
        },
      }),
    }),
    runTransaction: async (handler: (tx: unknown) => Promise<unknown>) =>
      handler({
        get: async () => ({
          exists: state.doc !== undefined,
          data: () => state.doc,
        }),
        set: (
          _ref: unknown,
          value: Record<string, unknown>,
          _options?: unknown
        ) => {
          state.writes.push({ value });
          state.doc = { ...(state.doc ?? {}), ...value };
        },
      }),
  },
}));

import {
  getSignatureFailureStatus,
  recordSignatureFailure,
  recordSignatureSuccess,
  SIGNATURE_FAILURE_ALERT_THRESHOLD,
} from "./paypalWebhookHealth";

beforeEach(() => {
  state.doc = undefined;
  state.writes = [];
  state.readError = null;
  mirror.enabled = false;
  mirror.get.mockReset();
  mirror.set.mockReset();
  mirror.get.mockResolvedValue(null);
  mirror.set.mockResolvedValue("OK");
});

describe("paypal webhook signature-failure tracking", () => {
  it("starts a run at one and stamps when it began", async () => {
    await expect(recordSignatureFailure()).resolves.toBe(1);

    expect(state.doc).toMatchObject({
      consecutiveFailures: 1,
      firstFailureAt: "__SERVER_TS__",
      lastFailureAt: "__SERVER_TS__",
    });
    // Nothing to alert on yet.
    expect(state.doc?.alertingSince).toBeUndefined();
  });

  it("keeps counting and marks the crossing once", async () => {
    await recordSignatureFailure();
    await recordSignatureFailure();
    await recordSignatureFailure();
    await recordSignatureFailure();

    expect(state.doc).toMatchObject({
      consecutiveFailures: 4,
      // Stamped at the threshold and not rewritten after it, so the incident
      // keeps the time it started rather than sliding forward with each retry.
      alertingSince: "__SERVER_TS__",
    });
    // The first failure's time is preserved, not overwritten by later ones.
    expect(state.doc?.firstFailureAt).toBe("__SERVER_TS__");
  });

  it("resets the run when a delivery verifies, clearing the alert marker", async () => {
    for (let i = 0; i < SIGNATURE_FAILURE_ALERT_THRESHOLD; i += 1) {
      await recordSignatureFailure();
    }
    expect((await getSignatureFailureStatus())?.alerting).toBe(true);

    await recordSignatureSuccess();

    expect(state.doc).toMatchObject({
      consecutiveFailures: 0,
      lastSuccessAt: "__SERVER_TS__",
      alertingSince: "__DELETE__",
    });
    const status = await getSignatureFailureStatus();
    expect(status).toMatchObject({ consecutiveFailures: 0, alerting: false });
  });

  it("reports a run and its age for the health probe", async () => {
    state.doc = {
      consecutiveFailures: 5,
      lastFailureAt: new Date("2026-11-21T09:00:00.000Z"),
      alertingSince: { toDate: () => new Date("2026-11-20T09:00:00.000Z") },
    };

    await expect(getSignatureFailureStatus()).resolves.toEqual({
      consecutiveFailures: 5,
      lastFailureAt: "2026-11-21T09:00:00.000Z",
      alertingSince: "2026-11-20T09:00:00.000Z",
      alerting: true,
    });
  });

  it("reports a clean run when the document does not exist", async () => {
    await expect(getSignatureFailureStatus()).resolves.toEqual({
      consecutiveFailures: 0,
      lastFailureAt: null,
      alertingSince: null,
      alerting: false,
    });
  });

  it("returns null rather than throwing when the counter cannot be read", async () => {
    state.readError = new Error("firestore unavailable");

    // Health must answer `unknown`, not `degraded`: a read failure is not
    // evidence that payment confirmations are being dropped.
    await expect(getSignatureFailureStatus()).resolves.toBeNull();
  });
});

describe("the Redis mirror of the counter", () => {
  beforeEach(() => {
    mirror.enabled = true;
  });

  it("answers from the mirror without touching Firestore", async () => {
    mirror.get.mockResolvedValue(
      JSON.stringify({
        consecutiveFailures: 4,
        lastFailureAt: "2026-11-21T09:00:00.000Z",
        alertingSince: null,
      })
    );

    await expect(getSignatureFailureStatus()).resolves.toEqual({
      consecutiveFailures: 4,
      lastFailureAt: "2026-11-21T09:00:00.000Z",
      alertingSince: null,
      alerting: true,
    });
    // The stored document is deliberately stale: a Firestore read here would
    // mean the mirror is not being preferred, which is the whole point of it.
    expect(state.doc).toBeUndefined();
  });

  it("fills in defaults for a payload missing every field", async () => {
    mirror.get.mockResolvedValue("{}");

    await expect(getSignatureFailureStatus()).resolves.toEqual({
      consecutiveFailures: 0,
      lastFailureAt: null,
      alertingSince: null,
      alerting: false,
    });
  });

  it("falls back to Firestore when the mirror holds no key", async () => {
    mirror.get.mockResolvedValue(null);
    state.doc = { consecutiveFailures: 2 };

    await expect(getSignatureFailureStatus()).resolves.toMatchObject({
      consecutiveFailures: 2,
      alerting: false,
    });
  });

  it("falls back to Firestore when the mirror read throws", async () => {
    mirror.get.mockRejectedValue(new Error("upstash down"));
    state.doc = { consecutiveFailures: 1 };

    await expect(getSignatureFailureStatus()).resolves.toMatchObject({
      consecutiveFailures: 1,
    });
  });

  it("falls back to Firestore when the mirror holds unusable JSON", async () => {
    mirror.get.mockResolvedValue("not json");
    state.doc = { consecutiveFailures: 3 };

    await expect(getSignatureFailureStatus()).resolves.toMatchObject({
      consecutiveFailures: 3,
      alerting: true,
    });
  });

  it("writes each new count so a Firestore outage cannot hide the run", async () => {
    await recordSignatureFailure();
    await recordSignatureFailure();

    expect(mirror.set).toHaveBeenCalledTimes(2);
    expect(mirror.set).toHaveBeenLastCalledWith(
      "paypalWebhook",
      JSON.stringify({
        consecutiveFailures: 2,
        lastFailureAt: null,
        alertingSince: null,
      })
    );
  });

  it("does not fail the delivery when the mirror write fails", async () => {
    mirror.set.mockRejectedValue(new Error("upstash down"));

    // The counter lives in Firestore; losing the mirror copy must not turn a
    // rejected delivery into a 500 the caller has to interpret.
    await expect(recordSignatureFailure()).resolves.toBe(1);
  });
});

describe("counter and timestamp parsing", () => {
  it("ignores a count that is not a positive finite number", async () => {
    for (const value of [0, -2, "3", Number.NaN, null]) {
      state.doc = { consecutiveFailures: value };

      await expect(getSignatureFailureStatus()).resolves.toMatchObject({
        consecutiveFailures: 0,
        alerting: false,
      });
    }
  });

  it("passes a string timestamp through and drops a non-timestamp", async () => {
    state.doc = {
      consecutiveFailures: 1,
      lastFailureAt: "2026-01-01T00:00:00.000Z",
      alertingSince: 42,
    };

    await expect(getSignatureFailureStatus()).resolves.toEqual({
      consecutiveFailures: 1,
      lastFailureAt: "2026-01-01T00:00:00.000Z",
      alertingSince: null,
      alerting: false,
    });
  });
});
