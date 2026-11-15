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

beforeEach(() => {
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
