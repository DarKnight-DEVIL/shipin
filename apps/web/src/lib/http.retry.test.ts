/**
 * Tests for `fetchWithRetry` and the default retry policy.
 *
 * Split from `http.test.ts` (which owns `fetchWithTimeout`) so the fake-timer
 * dance around the backoff sleeps stays in one file: mixing them made the
 * timeout tests depend on which delay the retry tests had scheduled.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { HTTP_TIMEOUT_MS } from "@/config/constants";

import { DEFAULT_PAYPAL_RETRY_CONFIG, fetchWithRetry } from "./http";

describe("DEFAULT_PAYPAL_RETRY_CONFIG.isRetryable", () => {
  const isRetryable = (error: unknown) =>
    DEFAULT_PAYPAL_RETRY_CONFIG.isRetryable!(error);

  it("retries a 5xx response but not a 4xx", () => {
    expect(isRetryable(new Response(null, { status: 503 }))).toBe(true);
    expect(isRetryable(new Response(null, { status: 400 }))).toBe(false);
  });

  it("retries network, timeout and connection-reset errors", () => {
    const network = new TypeError("fetch failed");
    const timeout = Object.assign(new Error("aborted"), { name: "AbortError" });
    const refused = new Error("connect ECONNREFUSED 127.0.0.1:443");
    const timedOut = new Error("socket ETIMEDOUT");

    for (const error of [network, timeout, refused, timedOut]) {
      expect(isRetryable(error)).toBe(true);
    }
  });

  it("does not retry an ordinary error or a non-error", () => {
    expect(isRetryable(new Error("paypal said no"))).toBe(false);
    expect(isRetryable("nope")).toBe(false);
    expect(isRetryable(undefined)).toBe(false);
  });
});

describe("fetchWithRetry", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  /** Run the promise to completion, letting the backoff sleeps resolve. */
  const settle = async (promise: Promise<unknown>) => {
    const guarded = promise.then(
      (value) => ({ value }),
      (error) => ({ error })
    );
    await vi.runAllTimersAsync();
    return guarded;
  };

  it("returns the first successful response without retrying", async () => {
    const ok = new Response("ok", { status: 200 });
    const fetchMock = vi.fn().mockResolvedValue(ok);
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await expect(fetchWithRetry("https://api.paypal.com/x")).resolves.toBe(ok);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries a 5xx and returns the eventual success", async () => {
    const ok = new Response("ok", { status: 200 });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(ok);
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await settle(
      fetchWithRetry("https://api.paypal.com/x", {}, { maxRetries: 2 })
    );

    expect(result).toEqual({ value: ok });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("returns a non-retryable failure response instead of throwing", async () => {
    // A 400 is an answer, not a transport failure: the caller needs the body to
    // report it, so it must not be swallowed by the retry loop.
    const badRequest = new Response("bad", { status: 400 });
    const fetchMock = vi.fn().mockResolvedValue(badRequest);
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await expect(fetchWithRetry("https://api.paypal.com/x")).resolves.toBe(
      badRequest
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rethrows a non-retryable error immediately", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("invalid_grant"));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await expect(fetchWithRetry("https://api.paypal.com/x")).rejects.toThrow(
      "invalid_grant"
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("throws the last error once the retries are exhausted", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValue(new Error("connect ECONNREFUSED"));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await settle(
      fetchWithRetry("https://api.paypal.com/x", {}, { maxRetries: 2 })
    );

    expect(result).toMatchObject({
      error: expect.objectContaining({ message: "connect ECONNREFUSED" }),
    });
    // Attempt zero plus two retries.
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("keeps every backoff wait inside the configured ceiling", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.999);
    const fetchMock = vi.fn().mockRejectedValue(new Error("ETIMEDOUT"));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const timeoutSpy = vi.spyOn(global, "setTimeout");

    await settle(
      fetchWithRetry(
        "https://api.paypal.com/x",
        {},
        {
          maxRetries: 2,
          baseDelayMs: 1000,
          maxDelayMs: 1500,
          jitterFactor: 0.3,
        }
      )
    );

    const waits = timeoutSpy.mock.calls
      .map(([, ms]) => ms)
      .filter(
        (ms): ms is number => typeof ms === "number" && ms !== HTTP_TIMEOUT_MS
      );

    expect(waits.length).toBeGreaterThan(0);
    // The exponential term is capped, and the jitter is a fraction of the same
    // capped value, so no wait may exceed the cap plus its jitter share.
    for (const wait of waits) {
      expect(wait).toBeLessThanOrEqual(Math.ceil(1500 * 1.3));
    }
  });
});
