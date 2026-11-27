import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const mocks = vi.hoisted(() => ({
  requireAuthWithProfile: vi.fn(),
  get: vi.fn(),
  update: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  requireAuthWithProfile: mocks.requireAuthWithProfile,
}));

vi.mock("@/lib/firebaseAdmin", () => ({
  adminDb: {
    collection: () => ({
      doc: () => ({ get: mocks.get, update: mocks.update }),
    }),
    runTransaction: (callback: (tx: unknown) => unknown) =>
      callback({
        get: mocks.get,
        update: (_ref: unknown, data: unknown) => mocks.update(data),
      }),
  },
}));

vi.mock("firebase-admin/firestore", () => ({
  FieldValue: { serverTimestamp: () => "__TS__" },
}));

import { POST } from "./route";

const context = { params: Promise.resolve({ requestId: "req-1" }) };

const post = (payload: unknown = { preference: "wallet" }) =>
  new NextRequest("http://localhost/api/requests/req-1/refund", {
    method: "POST",
    body: JSON.stringify(payload),
  });

const paidRequest = (overrides: Record<string, unknown> = {}) => ({
  userId: "user-1",
  status: "purchased",
  payment: { amountPaid: 40, walletAmount: 10, paypalAmount: 30 },
  ...overrides,
});

beforeEach(() => {
  mocks.requireAuthWithProfile.mockReset().mockResolvedValue({
    token: { uid: "user-1" },
    profile: { uid: "user-1", role: "customer" },
  });
  mocks.get.mockReset();
  mocks.update.mockReset().mockResolvedValue(undefined);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("POST /api/requests/[requestId]/refund", () => {
  it("records the customer's refund request", async () => {
    mocks.get.mockResolvedValue({ exists: true, data: () => paidRequest() });

    const response = await POST(
      post({ preference: "wallet", initiatedBy: "customer" }),
      context
    );

    expect(response.status).toBe(200);
    expect(mocks.update.mock.calls[0][0]).toMatchObject({
      status: "refund_requested",
      refundRequest: {
        status: "requested",
        preference: "wallet",
        amount: 40,
        walletAmount: 40,
        paypalAmount: 0,
        initiatedBy: "customer",
      },
    });
  });

  it("accepts the original-sources preference the support UI offers", async () => {
    mocks.get.mockResolvedValue({ exists: true, data: () => paidRequest() });

    const response = await POST(post({ preference: "original_sources" }), context);

    expect(response.status).toBe(200);
    expect(mocks.update.mock.calls[0][0].refundRequest).toMatchObject({
      preference: "original_sources",
      walletAmount: 10,
      paypalAmount: 30,
    });
  });

  it("asks only for what is still refundable after prior refunds", async () => {
    mocks.get.mockResolvedValue({
      exists: true,
      data: () => paidRequest({ totalRefundedAmount: 15 }),
    });

    await POST(post({ preference: "original_payment" }), context);

    expect(mocks.update.mock.calls[0][0].refundRequest.amount).toBe(25);
  });

  it("splits only the remaining refundable amount across remaining sources", async () => {
    mocks.get.mockResolvedValue({
      exists: true,
      data: () =>
        paidRequest({
          totalRefundedAmount: 15,
          partialRefunds: [
            {
              amount: 15,
              method: "original_payment",
              walletRefundAmount: 10,
              paypalRefundAmount: 5,
            },
          ],
        }),
    });

    await POST(post({ preference: "original_sources" }), context);

    // The wallet share is exhausted, so the remaining $25 is all PayPal.
    expect(mocks.update.mock.calls[0][0].refundRequest).toMatchObject({
      amount: 25,
      walletAmount: 0,
      paypalAmount: 25,
    });
  });

  it("uses the remaining wallet balance before the PayPal share", async () => {
    mocks.get.mockResolvedValue({
      exists: true,
      data: () =>
        paidRequest({
          totalRefundedAmount: 5,
          partialRefunds: [
            {
              amount: 5,
              method: "wallet",
              walletRefundAmount: 5,
              paypalRefundAmount: 0,
            },
          ],
        }),
    });

    await POST(post({ preference: "original_sources" }), context);

    expect(mocks.update.mock.calls[0][0].refundRequest).toMatchObject({
      amount: 35,
      walletAmount: 5,
      paypalAmount: 30,
    });
  });

  it("consumes wallet first for a legacy partial refund with no recorded split", async () => {
    mocks.get.mockResolvedValue({
      exists: true,
      data: () =>
        paidRequest({
          totalRefundedAmount: 15,
          partialRefunds: [{ amount: 15, method: "original_payment" }],
        }),
    });

    await POST(post({ preference: "original_sources" }), context);

    // The $15 legacy refund is assumed to have used the wallet share first,
    // leaving only PayPal money for the remaining $25.
    expect(mocks.update.mock.calls[0][0].refundRequest).toMatchObject({
      amount: 25,
      walletAmount: 0,
      paypalAmount: 25,
    });
  });

  it("rejects a non-numeric payment breakdown", async () => {
    mocks.get.mockResolvedValue({
      exists: true,
      data: () =>
        paidRequest({
          payment: { amountPaid: 40, walletAmount: "oops", paypalAmount: 30 },
        }),
    });

    const response = await POST(post({ preference: "original_sources" }), context);

    expect(response.status).toBe(400);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("sends the whole remainder to the wallet for the wallet preference", async () => {
    mocks.get.mockResolvedValue({
      exists: true,
      data: () => paidRequest({ totalRefundedAmount: 15 }),
    });

    await POST(post({ preference: "wallet" }), context);

    expect(mocks.update.mock.calls[0][0].refundRequest).toMatchObject({
      amount: 25,
      walletAmount: 25,
      paypalAmount: 0,
    });
  });

  it("answers 404 for another customer's request", async () => {
    mocks.get.mockResolvedValue({
      exists: true,
      data: () => paidRequest({ userId: "user-2" }),
    });

    const response = await POST(post(), context);

    expect(response.status).toBe(404);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("rejects a duplicate refund request", async () => {
    mocks.get.mockResolvedValue({
      exists: true,
      data: () =>
        paidRequest({ refundRequest: { status: "requested" } }),
    });

    const response = await POST(post(), context);

    expect(response.status).toBe(400);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("accepts an active full-refund offer on a refund_offered request", async () => {
    mocks.get.mockResolvedValue({
      exists: true,
      data: () =>
        paidRequest({
          status: "refund_offered",
          refundOffer: { offered: true, amount: 40, reason: "Out of stock" },
        }),
    });

    const response = await POST(post({ preference: "wallet" }), context);

    expect(response.status).toBe(200);
    expect(mocks.update.mock.calls[0][0]).toMatchObject({
      status: "refund_requested",
      refundRequest: {
        status: "requested",
        preference: "wallet",
        amount: 40,
        walletAmount: 40,
        paypalAmount: 0,
      },
    });
  });

  it("refuses and refreshes an offer whose amount no longer matches the balance", async () => {
    mocks.get.mockResolvedValue({
      exists: true,
      data: () =>
        paidRequest({
          status: "refund_offered",
          totalRefundedAmount: 10,
          refundOffer: { offered: true, amount: 40, reason: "Out of stock" },
        }),
    });

    const response = await POST(post({ preference: "wallet" }), context);

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      success: false,
      code: "REFUND_OFFER_STALE",
      error:
        "The refund amount is now $30.00. Review the updated offer and accept it again.",
      refundOffer: { amount: 30, offered: true },
    });
    // The offer stored a stale amount, so it is refreshed to the real balance.
    expect(mocks.update).toHaveBeenCalledWith({
      "refundOffer.amount": 30,
      "refundOffer.refreshedAt": "__TS__",
      updatedAt: "__TS__",
    });
    expect(mocks.update.mock.calls[0][0].refundRequest).toBeUndefined();
  });

  it("voids the offer when a partial refund used up the balance", async () => {
    mocks.get.mockResolvedValue({
      exists: true,
      data: () =>
        paidRequest({
          status: "refund_offered",
          totalRefundedAmount: 40,
          refundOffer: { offered: true, amount: 40 },
        }),
    });

    const response = await POST(post({ preference: "wallet" }), context);

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      code: "REFUND_OFFER_STALE",
      error: "This request has already been refunded in full.",
      refundOffer: { amount: 0, offered: false },
    });
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        "refundOffer.offered": false,
        "refundOffer.staleReason": "fully_refunded",
      })
    );
  });

  it("refuses a full refund while a partial offer is still pending", async () => {
    mocks.get.mockResolvedValue({
      exists: true,
      data: () =>
        paidRequest({
          partialRefundOffer: { status: "offered", amount: 10 },
        }),
    });

    const response = await POST(post({ preference: "wallet" }), context);

    expect(response.status).toBe(400);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("rejects a refund_offered request whose offer is no longer active", async () => {
    mocks.get.mockResolvedValue({
      exists: true,
      data: () =>
        paidRequest({
          status: "refund_offered",
          refundOffer: { offered: false },
        }),
    });

    const response = await POST(post({ preference: "wallet" }), context);

    expect(response.status).toBe(400);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("rejects a request that has not been purchased", async () => {
    mocks.get.mockResolvedValue({
      exists: true,
      data: () => paidRequest({ status: "submitted" }),
    });

    const response = await POST(post(), context);

    expect(response.status).toBe(400);
  });

  it("rejects an invalid preference before reading the request", async () => {
    const response = await POST(post({ preference: "cash" }), context);

    expect(response.status).toBe(400);
    expect(mocks.get).not.toHaveBeenCalled();
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
      new NextRequest("http://localhost/api/requests/req-1/refund", {
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

  it("answers 404 for a request that does not exist", async () => {
    mocks.get.mockResolvedValue({ exists: false, data: () => undefined });

    const response = await POST(post(), context);

    expect(response.status).toBe(404);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("rejects a request with no payment record", async () => {
    mocks.get.mockResolvedValue({
      exists: true,
      data: () => paidRequest({ payment: undefined }),
    });

    const response = await POST(post(), context);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "No payment was found for this request.",
    });
  });

  it("rejects a non-positive payment amount", async () => {
    mocks.get.mockResolvedValue({
      exists: true,
      data: () => paidRequest({ payment: { amountPaid: 0 } }),
    });

    const response = await POST(post(), context);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "Invalid payment amount.",
    });
  });

  it("rejects a negative recorded refund total", async () => {
    mocks.get.mockResolvedValue({
      exists: true,
      data: () => paidRequest({ totalRefundedAmount: -1 }),
    });

    const response = await POST(post(), context);

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      code: "INTERNAL_ERROR",
    });
  });

  it("rejects a full refund when the balance is already spent", async () => {
    mocks.get.mockResolvedValue({
      exists: true,
      data: () => paidRequest({ totalRefundedAmount: 40 }),
    });

    const response = await POST(post(), context);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "This request has already been refunded in full.",
    });
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("falls back to the recorded split when only the wallet share is recorded", async () => {
    mocks.get.mockResolvedValue({
      exists: true,
      data: () =>
        paidRequest({
          totalRefundedAmount: 10,
          partialRefunds: [{ amount: 10, walletRefundAmount: 4 }],
        }),
    });

    const response = await POST(post({ preference: "original_payment" }), context);

    expect(response.status).toBe(200);
    // 40 paid, 10 already refunded through a partial whose PayPal share was
    // never recorded: the recorded wallet part (4) comes off the wallet
    // balance first, the unrecorded 6 follows, and PayPal owes what is left
    // of its own 30.
    expect(mocks.update.mock.calls[0][0].refundRequest).toMatchObject({
      amount: 30,
      walletAmount: 6,
      paypalAmount: 24,
    });
  });

  it("honours a fully recorded partial refund split", async () => {
    mocks.get.mockResolvedValue({
      exists: true,
      data: () =>
        paidRequest({
          totalRefundedAmount: 10,
          partialRefunds: [
            { amount: 10, walletRefundAmount: 4, paypalRefundAmount: 6 },
          ],
        }),
    });

    const response = await POST(post({ preference: "original_payment" }), context);

    expect(response.status).toBe(200);
    expect(mocks.update.mock.calls[0][0].refundRequest).toMatchObject({
      amount: 30,
      walletAmount: 6,
      paypalAmount: 24,
    });
  });

  it("sends a legacy wallet-method partial refund entirely to the wallet", async () => {
    mocks.get.mockResolvedValue({
      exists: true,
      data: () =>
        paidRequest({
          totalRefundedAmount: 5,
          partialRefunds: [{ amount: 5, method: "wallet" }],
        }),
    });

    const response = await POST(post({ preference: "original_payment" }), context);

    expect(response.status).toBe(200);
    expect(mocks.update.mock.calls[0][0].refundRequest).toMatchObject({
      amount: 35,
      walletAmount: 5,
      paypalAmount: 30,
    });
  });

  it("rejects a refund the remaining original sources cannot cover", async () => {
    mocks.get.mockResolvedValue({
      exists: true,
      data: () =>
        paidRequest({
          // A partial refund recorded against PayPal that the payment never
          // supported: the sources left cannot cover a fresh full refund.
          partialRefunds: [{ amount: 45, method: "paypal" }],
        }),
    });

    const response = await POST(post({ preference: "original_payment" }), context);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error:
        "This refund cannot be covered by the remaining original payment sources.",
    });
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("rejects unauthenticated callers", async () => {
    mocks.requireAuthWithProfile.mockResolvedValue(
      NextResponse.json({ success: false }, { status: 401 })
    );

    const response = await POST(post(), context);

    expect(response.status).toBe(401);
  });
});
