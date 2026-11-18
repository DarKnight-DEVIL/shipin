/**
 * Tests for the server-side idempotency store.
 *
 * The contract that matters: a replay returns the recorded response, an
 * expired or missing record does not, and a broken store never blocks the
 * write it was meant to observe.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  set: vi.fn(),
  doc: vi.fn((_id?: string) => ({ get: mocks.get, set: mocks.set })),
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

vi.mock("@/lib/firebaseAdmin", () => ({
  adminDb: {
    collection: () => ({ doc: mocks.doc }),
  },
}));

import {
  IDEMPOTENCY_TTL_MS,
  readIdempotencyKey,
  readIdempotentResponse,
  rememberIdempotentResponse,
} from "./idempotency";

const request = (headers: Record<string, string> = {}) =>
  new Request("https://shipin.test/api/payment/complete-wallet", { headers });

async function importWithRedis() {
  vi.resetModules();
  return import("./idempotency");
}

beforeEach(() => {
  mocks.env.url = "";
  mocks.env.token = "";
  mocks.redisGet.mockReset();
  mocks.redisSet.mockReset().mockResolvedValue("OK");
  mocks.doc.mockClear();
  mocks.get.mockReset();
  mocks.set.mockReset().mockResolvedValue(undefined);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("readIdempotencyKey", () => {
  it("returns the submitted key", () => {
    expect(readIdempotencyKey(request({ "idempotency-key": "abc-123-XYZ" }))).toBe(
      "abc-123-XYZ"
    );
  });

  it("returns null when the header is absent", () => {
    expect(readIdempotencyKey(request())).toBeNull();
  });

  it("ignores a key the store could not use", () => {
    // Too short, and characters outside the safe set. Ignoring keeps a header
    // typo from turning into a rejected payment.
    expect(readIdempotencyKey(request({ "idempotency-key": "short" }))).toBeNull();
    expect(
      readIdempotencyKey(request({ "idempotency-key": "has/slash/and spaces" }))
    ).toBeNull();
  });
});

describe("shared Redis store", () => {
  it("reads a replay from Redis without touching Firestore", async () => {
    mocks.env.url = "https://redis.test";
    mocks.env.token = "token";
    mocks.redisGet.mockResolvedValue(
      JSON.stringify({
        status: 200,
        body: { success: true },
        expiresAt: Date.now() + 60_000,
      })
    );

    const { readIdempotentResponse } = await importWithRedis();
    const result = await readIdempotentResponse({
      uid: "user-1",
      scope: "wallet.complete",
      key: "key-12345678",
    });

    expect(result).toEqual({ status: 200, body: { success: true } });
    expect(mocks.redisGet).toHaveBeenCalledTimes(1);
    expect(mocks.get).not.toHaveBeenCalled();
  });

  it("falls back to Firestore when Redis fails", async () => {
    mocks.env.url = "https://redis.test";
    mocks.env.token = "token";
    mocks.redisGet.mockRejectedValue(new Error("down"));
    mocks.get.mockResolvedValue({
      exists: true,
      data: () => ({ status: 201, body: { ok: true }, expiresAt: Date.now() + 1000 }),
    });

    const { readIdempotentResponse } = await importWithRedis();
    await expect(
      readIdempotentResponse({ uid: "user-1", scope: "s", key: "key-12345678" })
    ).resolves.toEqual({ status: 201, body: { ok: true } });
  });

  it("writes to Redis with a TTL and keeps the durable copy", async () => {
    mocks.env.url = "https://redis.test";
    mocks.env.token = "token";

    const { rememberIdempotentResponse, IDEMPOTENCY_TTL_MS } = await importWithRedis();
    await rememberIdempotentResponse(
      { uid: "user-1", scope: "s", key: "key-12345678" },
      { status: 200, body: { ok: true } }
    );

    expect(mocks.redisSet).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      { ex: Math.floor(IDEMPOTENCY_TTL_MS / 1000) }
    );
    expect(mocks.set).toHaveBeenCalled();
  });
});

describe("readIdempotentResponse", () => {
  it("returns the recorded response", async () => {
    mocks.get.mockResolvedValue({
      exists: true,
      data: () => ({
        status: 200,
        body: { success: true, transactionId: "txn-1" },
        expiresAt: Date.now() + 1000,
      }),
    });

    await expect(
      readIdempotentResponse({ uid: "user-1", scope: "wallet.complete", key: "key-1" })
    ).resolves.toEqual({ status: 200, body: { success: true, transactionId: "txn-1" } });
  });

  it("does not replay an expired record", async () => {
    mocks.get.mockResolvedValue({
      exists: true,
      data: () => ({ status: 200, body: {}, expiresAt: Date.now() - 1 }),
    });

    await expect(
      readIdempotentResponse({ uid: "user-1", scope: "wallet.complete", key: "key-1" })
    ).resolves.toBeNull();
  });

  it("returns null for an unknown key", async () => {
    mocks.get.mockResolvedValue({ exists: false });

    await expect(
      readIdempotentResponse({ uid: "user-1", scope: "wallet.complete", key: "key-1" })
    ).resolves.toBeNull();
  });

  it("fails open when the store is unreachable", async () => {
    // Blocking a real payment because the bookkeeping read failed would be
    // worse than losing the replay: the route's own transaction still refuses
    // a duplicate charge.
    mocks.get.mockRejectedValue(new Error("firestore down"));

    await expect(
      readIdempotentResponse({ uid: "user-1", scope: "wallet.complete", key: "key-1" })
    ).resolves.toBeNull();
    expect(console.error).toHaveBeenCalled();
  });
});

describe("rememberIdempotentResponse", () => {
  it("stores the response with a bounded lifetime", async () => {
    const before = Date.now();

    await rememberIdempotentResponse(
      { uid: "user-1", scope: "wallet.complete", key: "key-1" },
      { status: 200, body: { success: true } }
    );

    const [stored] = mocks.set.mock.calls[0];
    expect(stored).toMatchObject({
      uid: "user-1",
      scope: "wallet.complete",
      status: 200,
      body: { success: true },
    });
    expect(stored.expiresAt).toBeGreaterThanOrEqual(before + IDEMPOTENCY_TTL_MS);
  });

  it("does not throw when the write fails", async () => {
    mocks.set.mockRejectedValue(new Error("firestore down"));

    await expect(
      rememberIdempotentResponse(
        { uid: "user-1", scope: "wallet.complete", key: "key-1" },
        { status: 200, body: {} }
      )
    ).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalled();
  });

  it("scopes keys per user and per route", async () => {
    await rememberIdempotentResponse(
      { uid: "user-1", scope: "wallet.complete", key: "shared-key" },
      { status: 200, body: {} }
    );
    await rememberIdempotentResponse(
      { uid: "user-2", scope: "wallet.complete", key: "shared-key" },
      { status: 200, body: {} }
    );
    await rememberIdempotentResponse(
      { uid: "user-1", scope: "refund.initiate", key: "shared-key" },
      { status: 200, body: {} }
    );

    const ids = mocks.doc.mock.calls.map(([id]) => id as string);
    expect(new Set(ids).size).toBe(3);
  });
});
