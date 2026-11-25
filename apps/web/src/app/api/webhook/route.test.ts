import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  env: { PAYPAL_WEBHOOK_ID: "WH-1" as string | undefined },
  verifyPayPalWebhook: vi.fn(),
  recordRateLimit: vi.fn(),
  sendNotification: vi.fn(),
  docs: {} as Record<string, Record<string, unknown> | undefined>,
  txOverrides: {} as Record<string, { exists: boolean; data?: () => unknown }>,
  txGet: vi.fn(),
  txUpdate: vi.fn(),
  txSet: vi.fn(),
  txDelete: vi.fn(),
  ops: [] as string[],
}));

vi.mock("@/config/env", () => ({ serverEnv: mocks.env }));
vi.mock("@/lib/paypal", () => ({
  verifyPayPalWebhook: mocks.verifyPayPalWebhook,
}));
vi.mock("@/lib/rateLimiter", () => ({
  apiRateLimiter: { record: mocks.recordRateLimit },
  isRateLimited: (result: { ok: boolean }) => !result.ok,
  addRateLimitHeaders: (headers: Headers) => {
    headers.set("X-RateLimit-Limit", "30");
  },
}));
vi.mock("@/features/notifications/services/notificationService", () => ({
  sendNotification: mocks.sendNotification,
}));
vi.mock("firebase-admin/firestore", () => ({
  FieldValue: {
    serverTimestamp: () => "__SERVER_TS__",
    increment: (value: number) => ({ __increment: value }),
  },
}));
vi.mock("@/lib/firebaseAdmin", () => ({
  adminDb: {
    collection: (name: string) => ({
      doc: (id?: string) => {
        const path = `${name}/${id ?? "generated"}`;
        return {
          path,
          id: id ?? "generated",
          get: async () => {
            const data = mocks.docs[path];
            return { exists: data !== undefined, data: () => data };
          },
          set: async (data: Record<string, unknown>) => {
            mocks.docs[path] = data;
          },
        };
      },
    }),
    runTransaction: async (handler: (tx: unknown) => Promise<unknown>) =>
      handler({
        get: async (ref: { path: string }) => {
          mocks.ops.push(`read:${ref.path}`);
          mocks.txGet(ref);

          const override = mocks.txOverrides[ref.path];
          if (override) return override;

          const data = mocks.docs[ref.path];
          return { exists: data !== undefined, data: () => data };
        },
        update: (ref: { path: string }, data: Record<string, unknown>) => {
          mocks.ops.push(`write:${ref.path}`);
          mocks.txUpdate(ref, data);
        },
        set: (ref: { path: string }, data: Record<string, unknown>) => {
          mocks.ops.push(`write:${ref.path}`);
          mocks.txSet(ref, data);
        },
        delete: (ref: { path: string }) => {
          mocks.ops.push(`write:${ref.path}`);
          mocks.txDelete(ref);
        },
      }),
  },
}));

import { POST } from "./route";

const captureEvent = (overrides: Record<string, unknown> = {}) => ({
  event_type: "PAYMENT.CAPTURE.COMPLETED",
  resource: {
    id: "CAPTURE-1",
    amount: { value: "104.92", currency_code: "USD" },
    supplementary_data: { related_ids: { order_id: "ORDER-1" } },
    ...overrides,
  },
});

const PAYPAL_HEADERS = {
  "paypal-transmission-id": "tx-1",
  "paypal-transmission-sig": "sig",
  "paypal-transmission-time": "2026-01-01T00:00:00Z",
  "paypal-cert-url": "https://api.paypal.com/cert",
  "paypal-auth-algo": "SHA256withRSA",
};

const request = (
  body: unknown,
  headers: Record<string, string> = PAYPAL_HEADERS
) =>
  new NextRequest("http://localhost/api/webhook", {
    method: "POST",
    headers,
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

function seedOrder(overrides: Record<string, unknown> = {}) {
  mocks.docs["paypalPaymentOrders/ORDER-1"] = {
    status: "created",
    baseAmount: 100,
    totalRequired: 104.92,
    paypalAmount: 104.92,
    requestId: "req-1",
    userId: "user-1",
    walletApplied: 0,
    ...overrides,
  };
}

function seedRequest(overrides: Record<string, unknown> = {}) {
  mocks.docs["requests/req-1"] = {
    status: "awaiting_payment",
    userId: "user-1",
    customerName: "Ada",
    ...overrides,
  };
}

beforeEach(() => {
  mocks.env.PAYPAL_WEBHOOK_ID = "WH-1";
  mocks.docs = {};
  mocks.txOverrides = {};
  mocks.ops = [];
  mocks.verifyPayPalWebhook.mockReset().mockResolvedValue(true);
  mocks.recordRateLimit.mockReset().mockResolvedValue({
    ok: true,
    limit: 30,
    remaining: 29,
    reset: Date.now() + 60_000,
  });
  mocks.sendNotification.mockReset().mockResolvedValue(undefined);
  mocks.txGet.mockReset();
  mocks.txUpdate.mockReset();
  mocks.txSet.mockReset();
  mocks.txDelete.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("POST /api/webhook", () => {
  it("refuses to run without a configured webhook id", async () => {
    mocks.env.PAYPAL_WEBHOOK_ID = "";
    vi.resetModules();
    const { POST: unconfigured } = await import("./route");

    const response = await unconfigured(request(captureEvent()));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      code: "CONFIGURATION_ERROR",
    });
    expect(mocks.verifyPayPalWebhook).not.toHaveBeenCalled();
  });

  it("rejects an invalid signature", async () => {
    mocks.verifyPayPalWebhook.mockResolvedValue(false);

    const response = await POST(request(captureEvent()));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      code: "INVALID_SIGNATURE",
    });
    expect(console.warn).toHaveBeenCalled();
  });

  it("rejects a body that is not JSON", async () => {
    const response = await POST(request("{not json"));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      code: "INVALID_JSON",
    });
  });

  it("acknowledges events it does not process", async () => {
    const response = await POST(
      request({ event_type: "PAYMENT.CAPTURE.REFUNDED" })
    );

    expect(response.status).toBe(200);
    expect(mocks.txUpdate).not.toHaveBeenCalled();
  });

  it("acknowledges a capture without an order id", async () => {
    const response = await POST(
      request(captureEvent({ supplementary_data: {}, links: [] }))
    );

    expect(response.status).toBe(200);
    expect(mocks.txUpdate).not.toHaveBeenCalled();
  });

  it("finds the order id from the links when the related id is absent", async () => {
    seedOrder();
    seedRequest();

    const response = await POST(
      request(
        captureEvent({
          supplementary_data: {},
          links: [
            { rel: "order", href: "https://api.paypal.com/orders/ORDER-1" },
          ],
        })
      )
    );

    expect(response.status).toBe(200);
    expect(mocks.txUpdate).toHaveBeenCalled();
  });

  it("ignores an order it never stored", async () => {
    const response = await POST(request(captureEvent()));

    expect(response.status).toBe(200);
    expect(mocks.txUpdate).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalled();
  });

  it("is idempotent for an already completed order", async () => {
    seedOrder({ status: "completed" });
    seedRequest();

    await POST(request(captureEvent()));

    expect(mocks.txUpdate).not.toHaveBeenCalled();
  });

  it("skips a PayPal event id it has already processed", async () => {
    mocks.docs["paypalWebhookEvents/EV-1"] = {
      eventType: "PAYMENT.CAPTURE.COMPLETED",
    };

    const response = await POST(request({ ...captureEvent(), id: "EV-1" }));
    const body = await response.json();

    expect(body).toMatchObject({ received: true, duplicate: true });
    expect(mocks.sendNotification).not.toHaveBeenCalled();
  });

  it("records a processed event id so a retry is skipped", async () => {
    const response = await POST(
      request({ event_type: "PAYMENT.CAPTURE.REFUNDED", id: "EV-2" })
    );

    expect(response.status).toBe(200);
    expect(mocks.docs["paypalWebhookEvents/EV-2"]).toMatchObject({
      eventType: "PAYMENT.CAPTURE.REFUNDED",
    });
  });

  it("returns 500 for a capture whose amount differs so PayPal retries", async () => {
    seedOrder();

    const response = await POST(
      request({
        ...captureEvent({ amount: { value: "99.00", currency_code: "USD" } }),
        id: "EV-MISMATCH",
      })
    );

    // Returning 200 here would mark the event processed and hide the drift.
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      code: "WEBHOOK_PROCESSING_ERROR",
    });
    expect(mocks.txUpdate).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith(
      "PayPal capture amount mismatch:",
      expect.objectContaining({ orderId: "ORDER-1" })
    );
    expect(mocks.docs["paypalWebhookEvents/EV-MISMATCH"]).toBeUndefined();
  });

  it("reads every document before its first write", async () => {
    seedOrder();
    seedRequest();

    await POST(request(captureEvent()));

    const firstWrite = mocks.ops.findIndex((op) => op.startsWith("write:"));
    const lastRead = mocks.ops.reduce(
      (last, op, index) => (op.startsWith("read:") ? index : last),
      -1
    );

    expect(firstWrite).toBeGreaterThan(-1);
    // Firestore transactions reject a read after a write.
    expect(firstWrite).toBeGreaterThan(lastRead);
    expect(mocks.ops.filter((op) => op.startsWith("read:"))).toEqual(
      expect.arrayContaining([
        "read:requests/req-1",
        "read:paypalPaymentOrders/ORDER-1",
      ])
    );
  });

  it("marks the request paid with the same payment shape as settlement", async () => {
    seedOrder();
    seedRequest();

    const response = await POST(request(captureEvent()));

    const requestUpdate = mocks.txUpdate.mock.calls.find(
      ([ref]) => ref.path === "requests/req-1"
    );

    expect(requestUpdate?.[1]).toMatchObject({
      status: "paid",
      payment: {
        provider: "paypal",
        paymentMethod: "paypal",
        orderId: "ORDER-1",
        captureId: "CAPTURE-1",
        amount: 104.92,
        amountPaid: 104.92,
        paypalAmount: 104.92,
        walletAmount: 0,
        quoteAmount: 100,
        currency: "USD",
        status: "completed",
      },
    });
    expect(mocks.sendNotification).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user-1", type: "payment_received" })
    );
    await expect(response.json()).resolves.toEqual({
      received: true,
      success: true,
    });
  });

  it("uses the request's customer name, not the payment order", async () => {
    seedOrder();
    seedRequest({ customerName: "Grace" });

    await POST(request(captureEvent()));

    expect(mocks.sendNotification).toHaveBeenCalledWith(
      expect.objectContaining({ customerName: "Grace" })
    );
  });

  it("debits the wallet once into a deterministic ledger document and releases the hold", async () => {
    seedOrder({ walletApplied: 20, walletHoldId: "hold-1" });
    seedRequest();
    mocks.docs["wallets/user-1"] = { balance: 50, reserved: 20 };
    mocks.docs["walletHolds/hold-1"] = {
      userId: "user-1",
      amount: 20,
      status: "reserved",
    };

    await POST(request(captureEvent()));

    // Wallet starts at 50, applies 20, so new balance is 30 and nothing is
    // reserved once the hold is consumed.
    expect(mocks.txSet).toHaveBeenCalledWith(
      expect.objectContaining({ path: "wallets/user-1" }),
      expect.objectContaining({ balance: 30, balanceMinor: 3000, reserved: 0 })
    );
    expect(mocks.txSet).toHaveBeenCalledWith(
      expect.objectContaining({ path: "walletTransactions/paypal_CAPTURE-1" }),
      expect.objectContaining({
        amount: -20,
        amountMinor: -2000,
        type: "payment",
        balanceAfter: 30,
        balanceAfterMinor: 3000,
        userId: "user-1",
      })
    );
    expect(mocks.txDelete).toHaveBeenCalledWith(
      expect.objectContaining({ path: "walletHolds/hold-1" })
    );
  });

  it("debits a wallet written in integer minor units", async () => {
    // ADR-0008: after the wallet migration the document holds `balanceMinor`.
    // Phase 2 is the read side, so the same debit has to work off either form.
    seedOrder({ walletApplied: 20, walletHoldId: "hold-1" });
    seedRequest();
    mocks.docs["wallets/user-1"] = { balanceMinor: 5000, reserved: 20 };
    mocks.docs["walletHolds/hold-1"] = {
      userId: "user-1",
      amount: 20,
      status: "reserved",
    };

    await POST(request(captureEvent()));

    expect(mocks.txSet).toHaveBeenCalledWith(
      expect.objectContaining({ path: "wallets/user-1" }),
      expect.objectContaining({ balance: 30 })
    );
    expect(mocks.txSet).toHaveBeenCalledWith(
      expect.objectContaining({ path: "walletTransactions/paypal_CAPTURE-1" }),
      expect.objectContaining({ amount: -20, balanceAfter: 30 })
    );
  });

  it("does not debit the wallet twice when the ledger entry already exists", async () => {
    seedOrder({ walletApplied: 20, walletHoldId: "hold-1" });
    seedRequest();
    mocks.docs["wallets/user-1"] = { balance: 30, reserved: 0 };
    mocks.docs["walletTransactions/paypal_CAPTURE-1"] = { amount: -20 };

    await POST(request(captureEvent()));

    expect(mocks.txSet).not.toHaveBeenCalledWith(
      expect.objectContaining({ path: "wallets/user-1" }),
      expect.anything()
    );
  });

  it("returns 500 when the wallet document is missing so the debit is not skipped", async () => {
    seedOrder({ walletApplied: 20 });
    seedRequest();

    const response = await POST(request(captureEvent()));

    // The order says wallet credit was used; silently skipping the debit
    // would leave the payment half-settled, so this must trigger a retry.
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      code: "WEBHOOK_PROCESSING_ERROR",
    });
    expect(mocks.txSet).not.toHaveBeenCalled();
  });

  it("returns 500 when the wallet cannot cover the reserved amount", async () => {
    seedOrder({ walletApplied: 20, walletHoldId: "hold-1" });
    seedRequest();
    mocks.docs["wallets/user-1"] = { balance: 5, reserved: 20 };

    const response = await POST(request(captureEvent()));

    expect(response.status).toBe(500);
    expect(mocks.txSet).not.toHaveBeenCalled();
  });

  it("stops when the request disappeared", async () => {
    seedOrder();

    await POST(request(captureEvent()));

    expect(mocks.txUpdate).not.toHaveBeenCalled();
  });

  it("marks the payment order complete without moving money when the request is already paid", async () => {
    seedOrder({ walletApplied: 20 });
    seedRequest({ status: "paid" });

    await POST(request(captureEvent()));

    expect(mocks.txUpdate).toHaveBeenCalledTimes(1);
    expect(mocks.txUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ path: "paypalPaymentOrders/ORDER-1" }),
      expect.objectContaining({ status: "completed" })
    );
    expect(mocks.txSet).not.toHaveBeenCalled();
  });

  it("returns 500 when processing throws so PayPal retries (idempotent handler)", async () => {
    seedOrder();
    seedRequest();
    mocks.txUpdate.mockImplementation(() => {
      throw new Error("transaction aborted");
    });

    const response = await POST(request(captureEvent()));

    // Returns 500 so PayPal retries the delivery.
    expect(response.status).toBe(500);
    expect(console.error).toHaveBeenCalledWith(
      "Webhook processing error:",
      expect.any(Error)
    );
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      code: "WEBHOOK_PROCESSING_ERROR",
    });
  });

  it("keeps a 200 when the notification fails (non-critical, outside transaction)", async () => {
    seedOrder();
    seedRequest();
    mocks.sendNotification.mockRejectedValue(new Error("mail down"));

    const response = await POST(request(captureEvent()));

    // Notification failure is logged but doesn't fail the webhook -
    // the payment was already committed in the transaction.
    expect(response.status).toBe(200);
    expect(console.error).toHaveBeenCalledWith(
      "Webhook notification failed:",
      expect.any(Error)
    );
  });

  it("rejects a flood with 429 before spending a PayPal verification call", async () => {
    mocks.recordRateLimit.mockResolvedValue({
      ok: false,
      limit: 30,
      remaining: 0,
      reset: Date.now() + 60_000,
    });

    const response = await POST(request(captureEvent()));

    expect(response.status).toBe(429);
    expect(response.headers.get("X-RateLimit-Limit")).toBe("30");
    expect(mocks.verifyPayPalWebhook).not.toHaveBeenCalled();
  });

  it("fails open when the limiter store is unavailable", async () => {
    mocks.recordRateLimit.mockResolvedValue({
      ok: false,
      unavailable: true,
      limit: 30,
      remaining: 0,
      reset: Date.now() + 60_000,
    });

    const response = await POST(request(captureEvent()));

    expect(response.status).not.toBe(429);
    expect(mocks.verifyPayPalWebhook).toHaveBeenCalled();
  });

  it("rejects a delivery without PayPal signature headers before verification", async () => {
    const response = await POST(request(captureEvent(), {}));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      code: "INVALID_SIGNATURE",
    });
    expect(mocks.verifyPayPalWebhook).not.toHaveBeenCalled();
  });
});
