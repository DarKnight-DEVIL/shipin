import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const mocks = vi.hoisted(() => ({
  requireAuthWithProfile: vi.fn(),
  requestGet: vi.fn(),
  walletGet: vi.fn(),
  holdGet: vi.fn(),
  txSet: vi.fn(),
  txDelete: vi.fn(),
  orderSet: vi.fn(),
  runTransaction: vi.fn(),
  isQuoteExpired: vi.fn(),
  calculateProcessingFee: vi.fn(),
  getPayPalAccessToken: vi.fn(),
  fetch: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  requireAuthWithProfile: mocks.requireAuthWithProfile,
}));
vi.mock("@/lib/firebaseAdmin", () => ({
  adminDb: {
    collection: (name: string) => ({
      /*
       * A retried checkout has both a wallet and a hold; they must read
       * differently, because the reservation maths subtracts the hold.
       */
      doc: (id?: string) => {
        const ref = {
          id,
          path: `${name}/${id ?? ""}`,
          get: mocks.holdGet,
          set: mocks.orderSet,
        };
        if (name === "requests") return { ...ref, get: mocks.requestGet };
        if (name === "wallets") return { ...ref, get: mocks.walletGet };
        return ref;
      },
    }),
    runTransaction: mocks.runTransaction,
  },
}));
vi.mock("@/features/requests/services/quoteExpiry", () => ({
  isQuoteExpired: mocks.isQuoteExpired,
}));
vi.mock("@/features/finance/services/calculateProcessingFee", () => ({
  calculateProcessingFee: mocks.calculateProcessingFee,
}));
vi.mock("@/lib/paypal", () => ({
  getPayPalAccessToken: mocks.getPayPalAccessToken,
}));
vi.mock("@/config/env", () => ({
  serverEnv: { PAYPAL_API_URL: "https://paypal.test" },
}));

import { POST } from "./route";

const request = (
  body: unknown,
  headers: Record<string, string> = { authorization: "Bearer t" }
) =>
  new NextRequest("http://localhost/api/paypal/create-order", {
    method: "POST",
    headers,
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

const snap = (data: Record<string, unknown> | undefined) => ({
  exists: data !== undefined,
  data: () => data,
});

const requestDoc = {
  userId: "user-1",
  requestNumber: "REQ-100",
  quote: { expiresAt: "2027-01-01", breakdown: { grandTotal: 100 } },
};

const body = { requestId: "req-1", amount: 104.7 };

beforeEach(() => {
  mocks.requireAuthWithProfile.mockReset().mockResolvedValue({
    token: { uid: "user-1" },
    profile: { uid: "user-1", role: "customer" },
  });
  mocks.requestGet.mockReset().mockResolvedValue(snap(requestDoc));
  mocks.walletGet.mockReset().mockResolvedValue(snap({ balance: 0 }));
  mocks.holdGet.mockReset().mockResolvedValue(snap(undefined));
  mocks.txSet.mockReset();
  mocks.txDelete.mockReset();
  mocks.orderSet.mockReset().mockResolvedValue(undefined);
  mocks.runTransaction.mockReset().mockImplementation(async (fn) => {
    // Execute the transaction function with a mock transaction object.
    // `get` answers per document path, as a real transaction read does.
    const mockTransaction = {
      get: async (ref: { path?: string }) =>
        ref?.path?.startsWith("wallets/")
          ? mocks.walletGet()
          : mocks.holdGet(),
      set: mocks.txSet,
      delete: mocks.txDelete,
    };
    return fn(mockTransaction);
  });
  mocks.isQuoteExpired.mockReset().mockReturnValue(false);
  mocks.calculateProcessingFee
    .mockReset()
    .mockReturnValue({ fee: 4.7, totalToCharge: 104.7 });
  mocks.getPayPalAccessToken.mockReset().mockResolvedValue("access-token");
  mocks.fetch.mockReset().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ id: "order-1" }),
  });
  vi.stubGlobal("fetch", mocks.fetch);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("POST /api/paypal/create-order", () => {
  it("requires authentication", async () => {
    mocks.requireAuthWithProfile.mockResolvedValue(
      NextResponse.json({ success: false }, { status: 401 })
    );

    const response = await POST(request(body));

    expect(response.status).toBe(401);
    expect(mocks.requestGet).not.toHaveBeenCalled();
  });

  it("requires a request id", async () => {
    const response = await POST(request({ amount: 10 }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: "Invalid request body.",
    });
  });

  it("requires a numeric positive amount", async () => {
    const stringAmount = await POST(
      request({ requestId: "req-1", amount: "10" })
    );
    const zero = await POST(request({ requestId: "req-1", amount: 0 }));

    expect([stringAmount.status, zero.status]).toEqual([400, 400]);
  });

  it("rejects an unknown payment type", async () => {
    const response = await POST(request({ ...body, paymentType: "barter" }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: "Invalid request body.",
    });
  });

  it("requires an additional item id for that payment type", async () => {
    const response = await POST(
      request({ ...body, paymentType: "additional_item" })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: "Additional item request ID is required.",
    });
  });

  it("404s for an unknown request", async () => {
    mocks.requestGet.mockResolvedValue(snap(undefined));

    const response = await POST(request(body));

    expect(response.status).toBe(404);
  });

  it("404s when the request has no data", async () => {
    mocks.requestGet.mockResolvedValue(snap({}));

    const response = await POST(request(body));

    expect(response.status).toBe(403);
  });

  it("refuses to charge another customer's request", async () => {
    mocks.requestGet.mockResolvedValue(
      snap({ ...requestDoc, userId: "someone-else" })
    );

    const response = await POST(request(body));

    expect(response.status).toBe(403);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("blocks an expired quotation", async () => {
    mocks.isQuoteExpired.mockReturnValue(true);

    const response = await POST(request(body));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: "This quotation has expired. Please request a new quote.",
    });
  });

  it("requires a positive quote total", async () => {
    mocks.requestGet.mockResolvedValue(
      snap({ ...requestDoc, quote: { breakdown: {} } })
    );

    const response = await POST(request(body));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: "A valid quotation amount could not be found.",
    });
  });

  it("refuses an amount above the amount due", async () => {
    const response = await POST(request({ ...body, amount: 200 }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: "PayPal payment amount exceeds the amount due.",
    });
  });

  it("refuses an amount one cent above the amount due", async () => {
    const response = await POST(
      request({ ...body, amount: Number((104.7 + 0.01).toFixed(2)) })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: "Payment amount could not be verified.",
    });
  });

  it("accepts the amount due expressed with float noise", async () => {
    const response = await POST(
      request({ ...body, amount: Number((104.7).toPrecision(17)) })
    );

    expect(response.status).not.toBe(400);
  });

  it("requires a request owner", async () => {
    mocks.requestGet.mockResolvedValue(snap({ quote: requestDoc.quote }));

    const response = await POST(request(body));

    expect(response.status).toBe(403);
  });

  it("refuses to spend more wallet balance than exists", async () => {
    const response = await POST(request({ ...body, amount: 100 }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error:
        "The requested wallet amount exceeds the available wallet balance.",
    });
  });

  it("sees the money in a wallet that only holds integer minor units", async () => {
    // ADR-0008. The route used to rebuild the wallet as `{ balance, reserved }`
    // before asking what was available, which read a migrated wallet as empty and
    // silently put the whole order on PayPal.
    mocks.walletGet.mockResolvedValue(
      snap({ balanceMinor: 5000, reservedMinor: 0, currency: "USD" })
    );

    const response = await POST(request({ ...body, amount: 54.7 }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({ walletApplied: 50, paypalAmount: 54.7 })
    );
  });

  it("treats an empty wallet as zero balance", async () => {
    mocks.walletGet.mockResolvedValue(snap(undefined));

    const response = await POST(request(body));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({ walletApplied: 0, paypalAmount: 104.7 })
    );
  });

  it("surfaces a PayPal create failure", async () => {
    mocks.fetch.mockResolvedValue({
      ok: false,
      status: 422,
      json: async () => ({ message: "Bad card" }),
    });

    const response = await POST(request(body));

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: "Unable to process payment. Please try again.",
    });
  });

  it("releases the reservation when the PayPal call throws", async () => {
    // A thrown network error is not a PayPal refusal: no order exists, so the
    // hold must go now instead of sitting on the balance until its expiry.
    mocks.walletGet.mockResolvedValue(snap({ balance: 20, reserved: 20 }));
    mocks.holdGet.mockResolvedValue(
      snap({ userId: "user-1", amount: 20, status: "reserved" })
    );
    mocks.fetch.mockRejectedValue(new Error("connection reset"));

    const response = await POST(request({ ...body, amount: 84.7 }));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: "Internal server error",
    });

    // The reservation was made, then released: the hold is gone and the wallet
    // no longer counts the money as promised.
    expect(mocks.txSet).toHaveBeenCalledWith(
      expect.objectContaining({ path: expect.stringMatching(/^walletHolds\//) }),
      expect.objectContaining({ amount: 20, status: "reserved" })
    );
    expect(mocks.txDelete).toHaveBeenCalledWith(
      expect.objectContaining({ path: expect.stringMatching(/^walletHolds\//) })
    );
    const releasedWrite = mocks.txSet.mock.calls.find(
      ([, data]) => data?.reserved === 0
    );
    expect(releasedWrite?.[0]).toMatchObject({ path: "wallets/user-1" });
  });

  it("requires PayPal to return an order id", async () => {
    mocks.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({}),
    });

    const response = await POST(request(body));

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: "PayPal did not return an order ID.",
    });
  });

  it("creates a main payment order with the processing fee", async () => {
    const response = await POST(request(body));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      orderId: "order-1",
      amount: 104.7,
      baseAmount: 100,
      processingFee: 4.7,
      totalRequired: 104.7,
      walletApplied: 0,
      paypalAmount: 104.7,
    });
    expect(mocks.orderSet).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: "order-1",
        requestId: "req-1",
        userId: "user-1",
        paymentType: "main",
        baseAmount: 100,
        totalRequired: 104.7,
        walletApplied: 0,
        paypalAmount: 104.7,
        status: "created",
      })
    );
    const sent = JSON.parse(mocks.fetch.mock.calls[0][1].body);
    expect(sent.purchase_units[0].amount.value).toBe("104.70");
    expect(sent.purchase_units[0].description).toBe("ShipIN Request REQ-100");
  });

  it("reserves the wallet part so a later payment cannot spend it", async () => {
    mocks.walletGet.mockResolvedValue(snap({ balance: 20 }));

    const response = await POST(request({ ...body, amount: 84.7 }));

    expect(response.status).toBe(200);

    const holdWrite = mocks.txSet.mock.calls.find(
      ([, data]) => data?.status === "reserved"
    );
    expect(holdWrite?.[1]).toMatchObject({
      userId: "user-1",
      amount: 20,
      status: "reserved",
    });

    const walletWrite = mocks.txSet.mock.calls.find(
      ([, data]) => typeof data?.reserved === "number"
    );
    expect(walletWrite?.[1]).toMatchObject({ reserved: 20 });
  });

  it("releases the hold and the reservation when a retry drops the wallet share", async () => {
    // The first checkout reserved the whole balance; the retry pays everything
    // through PayPal, so neither the hold nor `wallets.reserved` may survive.
    mocks.walletGet.mockResolvedValue(snap({ balance: 20, reserved: 20 }));
    mocks.holdGet.mockResolvedValue(
      snap({ userId: "user-1", amount: 20, status: "reserved" })
    );

    const response = await POST(request(body));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({ walletApplied: 0, paypalAmount: 104.7 })
    );

    expect(mocks.txDelete).toHaveBeenCalledTimes(1);
    expect(mocks.txDelete.mock.calls[0][0]).toMatchObject({
      path: expect.stringMatching(/^walletHolds\//),
    });
    // Released together: the balance is spendable again, not just unheld.
    expect(mocks.txSet).toHaveBeenCalledWith(
      expect.objectContaining({ path: "wallets/user-1" }),
      expect.objectContaining({ reserved: 0 }),
      { merge: true }
    );
  });

  it("refuses a wallet share the unreserved balance cannot cover", async () => {
    // 20 is left, but 90 is already promised to another checkout.
    mocks.walletGet.mockResolvedValue(snap({ balance: 100, reserved: 90 }));

    const response = await POST(request({ ...body, amount: 84.7 }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error:
        "The requested wallet amount exceeds the available wallet balance.",
    });
    expect(mocks.txSet).not.toHaveBeenCalled();
  });

  it("applies wallet balance to reduce the PayPal amount", async () => {
    mocks.walletGet.mockResolvedValue(snap({ balance: 20 }));

    const response = await POST(request({ ...body, amount: 84.7 }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({ walletApplied: 20, paypalAmount: 84.7 })
    );
  });

  it("creates an additional item order", async () => {
    mocks.requestGet.mockResolvedValue(
      snap({
        ...requestDoc,
        additionalItemRequests: [
          { id: "item-1", status: "awaiting_payment", totalDue: 50 },
        ],
      })
    );
    mocks.calculateProcessingFee.mockReturnValue({
      fee: 2.5,
      totalToCharge: 52.5,
    });

    const response = await POST(
      request({
        requestId: "req-1",
        amount: 52.5,
        paymentType: "additional_item",
        additionalItemRequestId: "item-1",
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({ amount: 52.5, baseAmount: 50 })
    );
    const sent = JSON.parse(mocks.fetch.mock.calls[0][1].body);
    expect(sent.purchase_units[0].reference_id).toBe("req-1:item-1");
    expect(sent.purchase_units[0].description).toBe(
      "ShipIN Additional Item - REQ-100"
    );
  });

  it("404s for an unknown additional item", async () => {
    mocks.requestGet.mockResolvedValue(
      snap({ ...requestDoc, additionalItemRequests: [] })
    );

    const response = await POST(
      request({
        requestId: "req-1",
        amount: 10,
        paymentType: "additional_item",
        additionalItemRequestId: "nope",
      })
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: "Additional item request could not be found.",
    });
  });

  it("refuses an additional item that is not awaiting payment", async () => {
    mocks.requestGet.mockResolvedValue(
      snap({
        ...requestDoc,
        additionalItemRequests: [
          { id: "item-1", status: "paid", totalDue: 50 },
        ],
      })
    );

    const response = await POST(
      request({
        requestId: "req-1",
        amount: 10,
        paymentType: "additional_item",
        additionalItemRequestId: "item-1",
      })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: "This additional item is not awaiting payment.",
    });
  });

  it("refuses an additional item with no amount", async () => {
    mocks.requestGet.mockResolvedValue(
      snap({
        ...requestDoc,
        additionalItemRequests: [
          { id: "item-1", status: "awaiting_payment", totalDue: 0 },
        ],
      })
    );

    const response = await POST(
      request({
        requestId: "req-1",
        amount: 10,
        paymentType: "additional_item",
        additionalItemRequestId: "item-1",
      })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: "A valid additional item payment amount could not be found.",
    });
  });

  it("refuses to charge a completed additional item twice", async () => {
    mocks.requestGet.mockResolvedValue(
      snap({
        ...requestDoc,
        additionalItemRequests: [
          { id: "item-1", status: "awaiting_payment", totalDue: 50 },
        ],
        additionalPayments: [
          { additionalItemRequestId: "item-1", status: "completed" },
        ],
      })
    );

    const response = await POST(
      request({
        requestId: "req-1",
        amount: 52.5,
        paymentType: "additional_item",
        additionalItemRequestId: "item-1",
      })
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: "This additional item has already been paid.",
    });
  });

  it("reports an unreadable body as a bad request", async () => {
    const response = await POST(request("not json"));

    expect(response.status).toBe(400);
  });

  it("404s when the request document exists but has no data", async () => {
    mocks.requestGet.mockResolvedValue({ exists: true, data: () => null });

    const response = await POST(request(body));

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: "Request data not found.",
    });
  });

  it("404s when the additional item is not on the request", async () => {
    const response = await POST(
      request({
        ...body,
        paymentType: "additional_item",
        additionalItemRequestId: "ghost-item",
      })
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: "Additional item request could not be found.",
    });
  });

  it("turns a settlement-check signal into a 400, not a 500", async () => {
    /*
     * The transaction signals its refusals by throwing a known message, and the route
     * maps them to 400s. Those mappings are what a customer sees instead of "Internal
     * server error" when an amount cannot be verified, so they are exercised directly -
     * the earlier amount checks make the INVALID_PAYMENT_AMOUNT path unreachable through
     * the public route, which is exactly the kind of branch that rots unnoticed.
     */
    for (const [signal, message] of [
      ["INVALID_PAYMENT_AMOUNT", "Invalid payment amount."],
      [
        "PAYMENT_AMOUNT_MISMATCH",
        "Payment amount could not be verified.",
      ],
    ] as const) {
      mocks.runTransaction.mockRejectedValueOnce(new Error(signal));

      const response = await POST(request(body));

      expect(response.status, signal).toBe(400);
      await expect(response.json()).resolves.toEqual({
        success: false,
        error: message,
      });
    }
  });

  it("reports an unexpected failure as a server error", async () => {
    mocks.fetch.mockRejectedValue(new Error("connection reset"));

    const response = await POST(request(body));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: "Internal server error",
    });
  });
});
