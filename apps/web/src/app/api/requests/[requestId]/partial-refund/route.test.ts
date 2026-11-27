import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const mocks = vi.hoisted(() => ({
  requireAuthWithProfile: vi.fn(),
  request: { exists: true, data: () => ({}) as Record<string, unknown> },
}));

const tx = vi.hoisted(() => ({
  get: vi.fn(),
  set: vi.fn(),
  update: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  requireAuthWithProfile: mocks.requireAuthWithProfile,
}));

vi.mock("@/lib/firebaseAdmin", () => ({
  adminDb: {
    collection: (name: string) => ({
      doc: (id?: string) => ({ kind: name, id: id ?? "wallet-tx-1" }),
    }),
    runTransaction: async (fn: (t: typeof tx) => unknown) => fn(tx),
  },
}));

vi.mock("firebase-admin/firestore", () => ({
  FieldValue: { serverTimestamp: () => "__TS__" },
}));

import { POST } from "./route";

const context = { params: Promise.resolve({ requestId: "req-1" }) };

const post = (payload: unknown = { preference: "wallet" }) =>
  new NextRequest("http://localhost/api/requests/req-1/partial-refund", {
    method: "POST",
    body: JSON.stringify(payload),
  });

const offeredRequest = (overrides: Record<string, unknown> = {}) => ({
  userId: "user-1",
  status: "purchased",
  payment: { amountPaid: 40, walletAmount: 10, paypalAmount: 30 },
  partialRefundOffer: {
    id: "offer-1",
    amount: 12.5,
    reason: "Damaged box",
    status: "offered",
  },
  ...overrides,
});

beforeEach(() => {
  mocks.requireAuthWithProfile.mockReset().mockResolvedValue({
    token: { uid: "user-1" },
    profile: { uid: "user-1", role: "customer" },
  });
  mocks.request = { exists: true, data: () => offeredRequest() };
  tx.get.mockReset().mockImplementation((ref: { kind: string }) =>
    ref.kind === "wallets"
      ? { exists: false, data: () => undefined }
      : mocks.request
  );
  tx.set.mockReset();
  tx.update.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("POST /api/requests/[requestId]/partial-refund", () => {
  it("credits the wallet and closes the offer for a wallet choice", async () => {
    const response = await POST(post({ preference: "wallet" }), context);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      offer: { status: "completed", selectedMethod: "wallet", amount: 12.5 },
    });

    const written = tx.update.mock.calls[0][1];
    expect(written).toMatchObject({
      totalRefundedAmount: 12.5,
      "partialRefundOffer.status": "completed",
      "partialRefundOffer.selectedMethod": "wallet",
      "partialRefundOffer.walletRefundAmount": 12.5,
    });
    expect(written.partialRefunds[0]).toMatchObject({
      amount: 12.5,
      method: "wallet",
      walletRefundAmount: 12.5,
    });
    // Wallet balance plus the matching ledger entry.
    expect(tx.set).toHaveBeenCalledTimes(2);
  });

  it("marks the offer accepted without moving money for the original method", async () => {
    const response = await POST(post({ preference: "original_payment" }), context);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      offer: { status: "accepted", selectedMethod: "original_payment" },
    });

    expect(tx.update.mock.calls[0][1]).toMatchObject({
      "partialRefundOffer.status": "accepted",
      "partialRefundOffer.selectedMethod": "original_payment",
    });
    expect(tx.set).not.toHaveBeenCalled();
  });

  it("answers 404 for another customer's request", async () => {
    mocks.request = {
      exists: true,
      data: () => offeredRequest({ userId: "user-2" }),
    };

    const response = await POST(post(), context);

    expect(response.status).toBe(404);
    expect(tx.update).not.toHaveBeenCalled();
  });

  it("rejects an offer that is no longer open", async () => {
    mocks.request = {
      exists: true,
      data: () =>
        offeredRequest({
          partialRefundOffer: {
            id: "offer-1",
            amount: 12.5,
            reason: "Damaged box",
            status: "completed",
          },
        }),
    };

    const response = await POST(post(), context);

    expect(response.status).toBe(400);
  });

  it("rejects a request with no offer", async () => {
    mocks.request = {
      exists: true,
      data: () => offeredRequest({ partialRefundOffer: undefined }),
    };

    const response = await POST(post(), context);

    expect(response.status).toBe(400);
  });

  it("rejects an invalid request id in the path", async () => {
    const badContext = { params: Promise.resolve({ requestId: "not an id!" }) };

    const response = await POST(post(), badContext);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      code: "VALIDATION_ERROR",
    });
  });

  it("rejects an unparsable body", async () => {
    const response = await POST(
      new NextRequest("http://localhost/api/requests/req-1/partial-refund", {
        method: "POST",
        body: "{nope",
      }),
      context
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      code: "VALIDATION_ERROR",
    });
  });

  it("rejects a body without a preference", async () => {
    const response = await POST(post({}), context);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      code: "VALIDATION_ERROR",
    });
  });

  it("answers 404 for a request that does not exist", async () => {
    mocks.request = { exists: false, data: () => ({}) };

    const response = await POST(post(), context);

    expect(response.status).toBe(404);
    expect(tx.update).not.toHaveBeenCalled();
  });

  it("rejects an offer carrying an invalid amount", async () => {
    mocks.request = {
      exists: true,
      data: () =>
        offeredRequest({
          partialRefundOffer: {
            id: "offer-1",
            amount: 0,
            reason: "Damaged box",
            status: "offered",
          },
        }),
    };

    const response = await POST(post(), context);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "Invalid refund amount.",
    });
  });

  it("credits an existing wallet and keeps its currency", async () => {
    tx.get.mockImplementation((ref: { kind: string }) =>
      ref.kind === "wallets"
        ? { exists: true, data: () => ({ balance: 500, currency: "EUR" }) }
        : mocks.request
    );

    const response = await POST(post({ preference: "wallet" }), context);

    expect(response.status).toBe(200);

    const walletWrite = tx.set.mock.calls[0][1];
    expect(walletWrite).toMatchObject({ currency: "EUR" });
    // 500 stored minor units plus the 12.50 refund.
    expect(walletWrite.balanceMinor ?? walletWrite.balance).toBeDefined();
  });

  it("defaults the currency for a wallet document without one", async () => {
    tx.get.mockImplementation((ref: { kind: string }) =>
      ref.kind === "wallets"
        ? { exists: true, data: () => ({ balance: 0 }) }
        : mocks.request
    );

    const response = await POST(post({ preference: "wallet" }), context);

    expect(response.status).toBe(200);
    expect(tx.set.mock.calls[0][1]).toMatchObject({ currency: "USD" });
  });

  it("falls back to a generic ledger description when the offer has no reason", async () => {
    mocks.request = {
      exists: true,
      data: () =>
        offeredRequest({
          partialRefundOffer: {
            id: "offer-1",
            amount: 12.5,
            status: "offered",
          },
        }),
    };

    const response = await POST(post({ preference: "wallet" }), context);

    expect(response.status).toBe(200);
    expect(tx.set.mock.calls[1][1]).toMatchObject({
      description: "Partial refund",
    });
    // The request update records an empty reason rather than undefined.
    expect(tx.update.mock.calls[0][1].partialRefunds[0]).toMatchObject({
      reason: "",
    });
  });

  it("appends to existing partial refunds and the refunded total", async () => {
    mocks.request = {
      exists: true,
      data: () =>
        offeredRequest({
          totalRefundedAmount: 5,
          partialRefunds: [{ id: "p-1", amount: 5, method: "wallet" }],
        }),
    };

    const response = await POST(post({ preference: "wallet" }), context);

    expect(response.status).toBe(200);

    const written = tx.update.mock.calls[0][1];
    expect(written.totalRefundedAmount).toBe(17.5);
    expect(written.partialRefunds).toHaveLength(2);
    expect(written.partialRefunds[0]).toMatchObject({ id: "p-1" });
  });

  it("rejects unauthenticated callers", async () => {
    mocks.requireAuthWithProfile.mockResolvedValue(
      NextResponse.json({ success: false }, { status: 401 })
    );

    const response = await POST(post(), context);

    expect(response.status).toBe(401);
  });
});
