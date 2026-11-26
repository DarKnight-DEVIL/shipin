import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The degraded-mode circuit breaker.
 *
 * The revocation list fails closed, which is right for security and harsh in an outage:
 * every admin request verifies a session through it, so an unreachable Upstash evicts
 * every admin mid-workflow. This breaker is the explicit, opt-in exception - and because
 * it is an exception to fail-closed, every bound on it is pinned here: when it opens,
 * when it refuses again, how loudly it complains, and what `/api/health` says meanwhile.
 */

const h = vi.hoisted(() => ({
  set: vi.fn(),
  exists: vi.fn(),
  captureServerError: vi.fn(),
  env: { url: "https://redis.example.upstash.io", token: "token" },
  isProduction: true,
  degradedMode: "",
  degradedSeconds: "",
}));

vi.mock("@upstash/redis", () => ({
  Redis: class {
    set = h.set;
    exists = h.exists;
  },
}));

vi.mock("@/config/env", () => ({
  get serverEnv() {
    return {
      UPSTASH_REDIS_REST_URL: h.env.url,
      UPSTASH_REDIS_REST_TOKEN: h.env.token,
      MFA_DENYLIST_DEGRADED_MODE: h.degradedMode,
      MFA_DENYLIST_DEGRADED_SECONDS: h.degradedSeconds,
    };
  },
  get isProduction() {
    return h.isProduction;
  },
}));

vi.mock("@/lib/errorTracking", () => ({
  captureServerError: (...args: unknown[]) => h.captureServerError(...args),
}));

/** The module caches both its client and its breaker, so each test loads it fresh. */
async function load() {
  vi.resetModules();
  return import("./mfaDenylist");
}

/** Every alert this module raised with the given code. */
function alertsWith(code: string): number {
  return h.captureServerError.mock.calls.filter(
    ([, options]) => (options as { code?: string } | undefined)?.code === code
  ).length;
}

beforeEach(() => {
  h.set.mockReset().mockResolvedValue("OK");
  h.exists.mockReset().mockResolvedValue(1);
  h.captureServerError.mockReset();
  h.env = { url: "https://redis.example.upstash.io", token: "token" };
  h.isProduction = true;
  h.degradedMode = "";
  h.degradedSeconds = "";
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("the degraded-mode circuit breaker", () => {
  it("stays closed when an operator has not asked for it", async () => {
    h.exists.mockRejectedValue(new Error("store unreachable"));
    const { isMfaSessionDenied } = await load();

    // Three failures, three refusals: the default answer to "unknown" is still "no".
    await expect(isMfaSessionDenied("jti-1")).resolves.toBe(true);
    await expect(isMfaSessionDenied("jti-1")).resolves.toBe(true);
    await expect(isMfaSessionDenied("jti-1")).resolves.toBe(true);

    expect(alertsWith("MFA_DENYLIST_DEGRADED_OPEN")).toBe(0);
  });

  it("keeps refusing below the threshold even in open mode", async () => {
    h.degradedMode = "open";
    h.exists.mockRejectedValue(new Error("store unreachable"));
    const { isMfaSessionDenied } = await load();

    // Two failures is a blip, not an outage.
    await expect(isMfaSessionDenied("jti-1")).resolves.toBe(true);
    await expect(isMfaSessionDenied("jti-1")).resolves.toBe(true);

    expect(alertsWith("MFA_DENYLIST_DEGRADED_OPEN")).toBe(0);
  });

  it("opens after three failures, alerts once, and counts what it allowed", async () => {
    h.degradedMode = "open";
    h.exists.mockRejectedValue(new Error("store unreachable"));
    const { isMfaSessionDenied, mfaDenylistStatus } = await load();

    await expect(isMfaSessionDenied("jti-1")).resolves.toBe(true);
    await expect(isMfaSessionDenied("jti-1")).resolves.toBe(true);

    // The third failure opens it: admins mid-workflow are no longer evicted.
    await expect(isMfaSessionDenied("jti-1")).resolves.toBe(false);

    expect(alertsWith("MFA_DENYLIST_DEGRADED_OPEN")).toBe(1);
    expect(mfaDenylistStatus()).toMatchObject({
      mode: "open",
      degraded: true,
      degradedAccepts: 1,
    });
  });

  it("stops hammering a store it believes is down", async () => {
    h.degradedMode = "open";
    h.exists.mockRejectedValue(new Error("store unreachable"));
    const { isMfaSessionDenied, mfaDenylistStatus } = await load();

    for (let attempt = 0; attempt < 3; attempt += 1) {
      await isMfaSessionDenied("jti-1");
    }

    const callsSoFar = h.exists.mock.calls.length;

    // Ten more verifications inside the probe interval: allowed, but with no network
    // call and no second alert. A dead store that is asked on every request turns an
    // outage into a slow outage.
    for (let attempt = 0; attempt < 10; attempt += 1) {
      await expect(isMfaSessionDenied("jti-1")).resolves.toBe(false);
    }

    expect(h.exists.mock.calls.length).toBe(callsSoFar);
    expect(alertsWith("MFA_DENYLIST_DEGRADED_OPEN")).toBe(1);
    expect(mfaDenylistStatus().degradedAccepts).toBe(11);
  });

  it("closes again as soon as the store answers", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));

    h.degradedMode = "open";
    h.exists.mockRejectedValue(new Error("store unreachable"));
    const { isMfaSessionDenied, mfaDenylistStatus } = await load();

    await isMfaSessionDenied("jti-1");
    await isMfaSessionDenied("jti-1");
    await isMfaSessionDenied("jti-1");
    expect(mfaDenylistStatus().degraded).toBe(true);

    // A revoked session must still be stopped once the store is back, so recovery is
    // checked for the refusal and not only for the flag.
    h.exists.mockResolvedValue(1);
    vi.setSystemTime(new Date("2026-01-01T00:01:00Z"));

    await expect(isMfaSessionDenied("jti-1")).resolves.toBe(true);
    expect(mfaDenylistStatus()).toMatchObject({
      degraded: false,
      consecutiveFailures: 0,
    });

    vi.useRealTimers();
  });

  it("refuses again once the window expires", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));

    h.degradedMode = "open";
    h.degradedSeconds = "60";
    h.exists.mockRejectedValue(new Error("store unreachable"));
    const { isMfaSessionDenied, mfaDenylistStatus } = await load();

    await isMfaSessionDenied("jti-1");
    await isMfaSessionDenied("jti-1");
    await expect(isMfaSessionDenied("jti-1")).resolves.toBe(false);

    // Still dark when the window closes: the answer returns to "refuse", because a
    // breaker that never closes is a bypass with extra steps.
    vi.setSystemTime(new Date("2026-01-01T00:02:00Z"));
    await expect(isMfaSessionDenied("jti-1")).resolves.toBe(true);

    // And it re-arms on the next failures, so a long outage needs no deploy.
    await isMfaSessionDenied("jti-1");
    await expect(isMfaSessionDenied("jti-1")).resolves.toBe(false);
    expect(mfaDenylistStatus().degraded).toBe(true);

    vi.useRealTimers();
  });

  it("clamps a nonsensical window to something survivable", async () => {
    h.degradedMode = "open";
    h.degradedSeconds = "999999";
    h.exists.mockRejectedValue(new Error("store unreachable"));
    const { isMfaSessionDenied, mfaDenylistStatus } = await load();

    await isMfaSessionDenied("jti-1");
    await isMfaSessionDenied("jti-1");
    await isMfaSessionDenied("jti-1");

    // An hour is the ceiling: waiting out a day-long bypass is not a thing.
    const until = new Date(mfaDenylistStatus().degradedUntil ?? 0).getTime();
    expect(until - Date.now()).toBeLessThanOrEqual(3600 * 1000 + 5);
  });

  it("treats any other mode value as closed", async () => {
    h.degradedMode = "yes";
    const { denylistMode, mfaDenylistStatus } = await load();

    expect(denylistMode()).toBe("closed");
    expect(mfaDenylistStatus()).toMatchObject({ mode: "closed", configured: true });
  });

  it("reports a store it cannot reach, so health can say so", async () => {
    h.env = { url: "", token: "" };
    const { mfaDenylistStatus } = await load();

    expect(mfaDenylistStatus()).toMatchObject({ configured: false, degraded: false });
  });
});
