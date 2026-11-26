// @vitest-environment node

/**
 * `POST /api/admin/payments/sweep` — settles payments PayPal captured but this
 * deployment never recorded.
 *
 * The route is thin on purpose: the decisions live in `sweepPendingPayments`,
 * covered by its own tests. What matters here is the wiring and the verdict —
 * an unsigned caller gets nothing, a missing secret fails closed instead of
 * looking like a bad signature, a clean sweep is a 200, and an unsettled
 * payment is a 500 so the scheduled run goes red instead of reporting success
 * over a charged customer.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import crypto from "crypto";

const mocks = vi.hoisted(() => {
  const state = {
    orders: [] as Array<{ id: string; data: Record<string, unknown> }>,
    topups: [] as Array<{ id: string; data: Record<string, unknown> }>,
    creditWallet: vi.fn(async () => ({
      ok: true as boolean,
      alreadyProcessed: false,
      balance: 40,
      status: 200,
      error: undefined as string | undefined,
    })),
    paypal: {} as Record<string, unknown>,
    settleMain: vi.fn(async () => ({ ok: true as boolean, error: undefined as string | undefined })),
    settleAdditional: vi.fn(async () => ({ ok: true as boolean })),
    writes: [] as Array<{ id: string; value: Record<string, unknown> }>,
  };

  const snapshot = (orders: typeof state.orders) => ({
    docs: orders.map((order) => ({
      id: order.id,
      data: () => order.data,
      ref: {
        id: order.id,
        set: async (value: Record<string, unknown>) => {
          state.writes.push({ id: order.id, value });
        },
      },
    })),
  });

  // Only the payment-order collection has candidates here; a top-up query must
  // find nothing, or the two sweeps read each other's documents.
  const chainFor = (name: string) => {
    const docs =
      name === "paypalPaymentOrders"
        ? state.orders
        : name === "walletTopupOrders"
          ? state.topups
          : [];
    const chain = {
      where: () => chain,
      limit: () => chain,
      get: async () => snapshot(docs),
    };
    return chain;
  };

  return {
    state,
    db: {
      collection: (name: string) => ({
        ...chainFor(name),
        doc: (id: string) => ({
          id,
          get: async () => ({ data: () => ({ userId: 'u1', customerName: 'C' }) }),
        }),
      }),
    },
  };
});

vi.mock("@/lib/firebaseAdmin", () => ({ adminDb: mocks.db }));

vi.mock("@/features/notifications/services/notificationService", () => ({
  sendNotification: vi.fn(async () => {}),
}));

vi.mock("@/lib/paypal/paymentReceivedNotification", () => ({
  buildPaymentReceivedNotification: () => ({ kind: "payment-received" }),
}));

vi.mock("@/lib/paypal", () => ({
  verifyPayPalOrder: async (id: string) => mocks.state.paypal[id] ?? { status: "CREATED" },
}));

vi.mock("@/lib/wallet/settleWalletTopup", () => ({
  settleWalletTopup: (...args: unknown[]) => mocks.state.creditWallet(...(args as [])),
}));

vi.mock("@/lib/paypal/settleMainPayment", () => ({
  settleMainPayment: (...args: unknown[]) => mocks.state.settleMain(...(args as [])),
}));

vi.mock("@/lib/paypal/settleAdditionalItemPayment", () => ({
  settleAdditionalItemPayment: (...args: unknown[]) =>
    mocks.state.settleAdditional(...(args as [])),
}));

import { POST } from "./route";

const SECRET = "test-cron-secret";

function signedRequest(): NextRequest {
  const timestamp = String(Date.now());
  const signature = crypto
    .createHmac("sha256", SECRET)
    .update(`${timestamp}|`)
    .digest("hex");

  return new NextRequest("http://localhost/api/admin/payments/sweep", {
    method: "POST",
    headers: {
      "x-cron-timestamp": timestamp,
      "x-cron-signature": signature,
    },
  });
}

function completedOrder(captureId = "CAP-1", value = "42.00") {
  return {
    status: "COMPLETED",
    purchase_units: [
      {
        payments: {
          captures: [
            { id: captureId, status: "COMPLETED", amount: { value, currency_code: "USD" } },
          ],
        },
      },
    ],
  };
}

beforeEach(() => {
  vi.stubEnv("CRON_SECRET", SECRET);
  mocks.state.orders = [];
  mocks.state.topups = [];
  mocks.state.creditWallet.mockClear();
  mocks.state.paypal = {};
  mocks.state.writes = [];
  mocks.state.settleMain.mockClear();
  mocks.state.settleAdditional.mockClear();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /api/admin/payments/sweep — auth", () => {
  it("refuses an unsigned caller", async () => {
    const response = await POST(
      new NextRequest("http://localhost/api/admin/payments/sweep", { method: "POST" })
    );

    expect(response.status).toBe(401);
    expect(mocks.state.settleMain).not.toHaveBeenCalled();
  });

  it("fails closed when the secret is missing", async () => {
    vi.stubEnv("CRON_SECRET", "");

    const response = await POST(signedRequest());

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({ code: "CONFIG_ERROR" });
  });
});

describe("POST /api/admin/payments/sweep — verdict", () => {
  it("reports a clean run when nothing is stuck", async () => {
    const response = await POST(signedRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ success: true, scanned: 0, settled: 0 });
  });

  it("settles an order PayPal already captured", async () => {
    mocks.state.orders = [
      { id: "ORDER-1", data: { orderId: "ORDER-1", requestId: "req-1", paymentType: "main" } },
    ];
    mocks.state.paypal["ORDER-1"] = completedOrder("CAP-1", "42.00");

    const response = await POST(signedRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.settled).toBe(1);
    expect(mocks.state.settleMain).toHaveBeenCalledWith(
      expect.objectContaining({ captureId: "CAP-1", capturedAmount: 42, requestId: "req-1" })
    );
  });

  it("emails the receipt a settled payment never got", async () => {
    // The browser path sends this when it settles. A swept payment is the same
    // event from the customer's side: charged, and until now silent.
    const { sendNotification } = await import(
      "@/features/notifications/services/notificationService"
    );
    mocks.state.orders = [
      { id: "ORDER-4", data: { orderId: "ORDER-4", requestId: "req-4", paymentType: "main" } },
    ];
    mocks.state.paypal["ORDER-4"] = completedOrder();

    const response = await POST(signedRequest());

    expect(response.status).toBe(200);
    expect(sendNotification).toHaveBeenCalledTimes(1);
  });

  it("goes red when a captured payment could not be settled", async () => {
    // A 500 is the point: a charged customer must turn the scheduled run red,
    // not become a green run carrying a detail nobody opens.
    mocks.state.orders = [
      { id: "ORDER-2", data: { orderId: "ORDER-2", requestId: "req-2", paymentType: "main" } },
    ];
    mocks.state.paypal["ORDER-2"] = completedOrder();
    mocks.state.settleMain.mockResolvedValueOnce({ ok: false, error: "Amount mismatch." });

    const response = await POST(signedRequest());
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.failures).toEqual([{ orderId: "ORDER-2", error: "Amount mismatch." }]);
  });

  it("credits a top-up PayPal captured but nobody credited", async () => {
    // The same failure as a stuck payment:  was the only trace
    // of the charge, and the customer paid without the balance moving.
    mocks.state.topups = [
      { id: "t1", data: { orderId: "PP-1", userId: "user-1", amount: 40 } },
    ];
    mocks.state.paypal["PP-1"] = completedOrder("CAP-T1", "40.00");

    const response = await POST(signedRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.topups).toMatchObject({ scanned: 1, credited: 1 });
    expect(mocks.state.creditWallet).toHaveBeenCalledWith(
      expect.objectContaining({
        topupOrder: expect.objectContaining({ userId: "user-1" }),
        capture: { captureId: "CAP-T1", amount: 40, currency: "USD" },
      })
    );
  });

  it("goes red when a captured top-up cannot be credited", async () => {
    mocks.state.topups = [
      { id: "t2", data: { orderId: "PP-2", userId: "user-1", amount: 40 } },
    ];
    mocks.state.paypal["PP-2"] = completedOrder("CAP-T2", "40.00");
    mocks.state.creditWallet.mockResolvedValueOnce({
      ok: false,
      alreadyProcessed: false,
      balance: 0,
      error: "Unexpected PayPal payment currency.",
      status: 400,
    });

    const response = await POST(signedRequest());
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.failures[0]).toMatchObject({ topupId: "t2" });
  });

  it("marks a voided order so it stops being polled", async () => {
    mocks.state.orders = [
      { id: "ORDER-3", data: { orderId: "ORDER-3", requestId: "req-3", paymentType: "main" } },
    ];
    mocks.state.paypal["ORDER-3"] = { status: "VOIDED" };

    const response = await POST(signedRequest());

    expect(response.status).toBe(200);
    expect(mocks.state.writes[0]).toMatchObject({
      id: "ORDER-3",
      value: { status: "voided", voidedBy: "paypal-sweep" },
    });
  });
});
