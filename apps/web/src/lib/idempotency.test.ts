/**
 * Tests for the server-side idempotency store.
 *
 * The contract that matters: a replay returns the recorded response, an
 * expired or missing record does not, and a broken store never blocks the
 * write it was meant to observe.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  env: { url: "", token: "" },
  redisGet: vi.fn(),
  redisSet: vi.fn(),
}));

vi.mock("@upstash/redis", () => ({
  Redis: class {
    get = mocks.redisGet;
    set = mocks.redisSet;
  },
}));

vi.mock("@/config/env", () => ({
  serverEnv: {
    get UPSTASH_REDIS_REST_URL() {
      return mocks.env.url;
    },
    get UPSTASH_REDIS_REST_TOKEN() {
      return mocks.env.token;
    },
  },
}));

import { readIdempotencyKey } from "./idempotency";

const request = (headers: Record<string, string> = {}) =>
  new Request("https://shipin.test/api/payment/complete-wallet", { headers });

/** Point the store at a fake Redis and re-import so the client is rebuilt. */
async function importWithRedis() {
  mocks.env.url = "https://redis.test";
  mocks.env.token = "token";
  vi.resetModules();
  return import("./idempotency");
}

beforeEach(() => {
  mocks.env.url = "";
  mocks.env.token = "";
  mocks.redisGet.mockReset();
  mocks.redisSet.mockReset().mockResolvedValue("OK");
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("readIdempotencyKey", () => {
  it("returns the submitted key", () => {
    expect(
      readIdempotencyKey(request({ "idempotency-key": "abc-123-XYZ" })),
    ).toBe("abc-123-XYZ");
  });

  it("returns null when the header is absent", () => {
    expect(readIdempotencyKey(request())).toBeNull();
  });

  it("ignores a key the store could not use", () => {
    // Too short, and characters outside the safe set. Ignoring keeps a header
    // typo from turning into a rejected payment.
    expect(
      readIdempotencyKey(request({ "idempotency-key": "short" })),
    ).toBeNull();
    expect(
      readIdempotencyKey(
        request({ "idempotency-key": "has/slash/and spaces" }),
      ),
    ).toBeNull();
  });
});

describe("readIdempotentResponse", () => {
  it("returns the recorded response", async () => {
    mocks.redisGet.mockResolvedValue(
      JSON.stringify({
        status: 200,
        body: { success: true, transactionId: "txn-1" },
        expiresAt: Date.now() + 60_000,
      }),
    );

    const { readIdempotentResponse } = await importWithRedis();

    await expect(
      readIdempotentResponse({
        uid: "user-1",
        scope: "wallet.complete",
        key: "key-1",
      }),
    ).resolves.toEqual({
      status: 200,
      body: { success: true, transactionId: "txn-1" },
    });
    expect(mocks.redisGet).toHaveBeenCalledTimes(1);
  });

  it("accepts a record the client already parsed", async () => {
    mocks.redisGet.mockResolvedValue({
      status: 201,
      body: { id: "req-1" },
      expiresAt: Date.now() + 60_000,
    });

    const { readIdempotentResponse } = await importWithRedis();

    await expect(
      readIdempotentResponse({
        uid: "user-1",
        scope: "refund.initiate",
        key: "key-1",
      }),
    ).resolves.toEqual({ status: 201, body: { id: "req-1" } });
  });

  it("does not replay an expired record", async () => {
    mocks.redisGet.mockResolvedValue(
      JSON.stringify({ status: 200, body: {}, expiresAt: Date.now() - 1 }),
    );

    const { readIdempotentResponse } = await importWithRedis();

    await expect(
      readIdempotentResponse({
        uid: "user-1",
        scope: "wallet.complete",
        key: "key-1",
      }),
    ).resolves.toBeNull();
  });

  it("returns null for an unknown key", async () => {
    mocks.redisGet.mockResolvedValue(null);

    const { readIdempotentResponse } = await importWithRedis();

    await expect(
      readIdempotentResponse({
        uid: "user-1",
        scope: "wallet.complete",
        key: "key-1",
      }),
    ).resolves.toBeNull();
  });

  it("returns null when the store is unreachable", async () => {
    // Blocking a real payment because the bookkeeping read failed would be
    // worse than losing the replay: the route's own transaction still refuses
    // a duplicate charge.
    mocks.redisGet.mockRejectedValue(new Error("redis down"));

    const { readIdempotentResponse } = await importWithRedis();

    await expect(
      readIdempotentResponse({
        uid: "user-1",
        scope: "wallet.complete",
        key: "key-1",
      }),
    ).resolves.toBeNull();
    expect(console.error).toHaveBeenCalled();
  });

  it("returns null when the shared store is not configured", async () => {
    vi.resetModules();
    const { readIdempotentResponse } = await import("./idempotency");

    await expect(
      readIdempotentResponse({
        uid: "user-1",
        scope: "wallet.complete",
        key: "key-1",
      }),
    ).resolves.toBeNull();
    expect(mocks.redisGet).not.toHaveBeenCalled();
  });
});

describe("rememberIdempotentResponse", () => {
  it("stores the response in Redis with a bounded lifetime", async () => {
    const { IDEMPOTENCY_TTL_MS, rememberIdempotentResponse } =
      await importWithRedis();

    await rememberIdempotentResponse(
      { uid: "user-1", scope: "wallet.complete", key: "key-1" },
      { status: 200, body: { success: true } },
    );

    expect(mocks.redisSet).toHaveBeenCalledTimes(1);
    expect(mocks.redisSet).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      { ex: Math.floor(IDEMPOTENCY_TTL_MS / 1000) },
    );
  });

  it("does not throw when the Redis write fails", async () => {
    mocks.redisSet.mockRejectedValue(new Error("redis down"));

    const { rememberIdempotentResponse } = await importWithRedis();

    await expect(
      rememberIdempotentResponse(
        { uid: "user-1", scope: "wallet.complete", key: "key-1" },
        { status: 200, body: {} },
      ),
    ).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalled();
  });

  it("scopes keys per user and per route", async () => {
    const { rememberIdempotentResponse } = await importWithRedis();

    await rememberIdempotentResponse(
      { uid: "user-1", scope: "wallet.complete", key: "shared-key" },
      { status: 200, body: {} },
    );
    await rememberIdempotentResponse(
      { uid: "user-2", scope: "wallet.complete", key: "shared-key" },
      { status: 200, body: {} },
    );
    await rememberIdempotentResponse(
      { uid: "user-1", scope: "refund.initiate", key: "shared-key" },
      { status: 200, body: {} },
    );

    const keys = mocks.redisSet.mock.calls.map((call) => call[0]);
    expect(keys).toHaveLength(3);
    expect(new Set(keys).size).toBe(3);
  });
});
