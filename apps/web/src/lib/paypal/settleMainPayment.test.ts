import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mocks = vi.hoisted(() => ({
  txGet: vi.fn(),
  txSet: vi.fn(),
  txUpdate: vi.fn(),
  runTransaction: vi.fn(),
}));

vi.mock("@/lib/firebaseAdmin", () => ({
  adminDb: {
    collection: (name: string) => ({
      doc: (id: string) => ({ id, __kind: name }),
    }),
    runTransaction: mocks.runTransaction,
  },
}));

vi.mock("firebase-admin/firestore", () => ({
  FieldValue: {
    serverTimestamp: () => "__SERVER_TS__",
    arrayUnion: (value: unknown) => ({ __UNION: value }),
  },
}));

import { settleMainPayment } from "./settleMainPayment";

const requestRef = { id: "req-1" };
const paymentOrderRef = { id: "order-1" };

const paymentOrder = {
  userId: "user-1",
  baseAmount: 100,
  totalRequired: 104.7,
  walletApplied: 20,
};

const walletSnap = (balance?: number) => ({
  exists: balance !== undefined,
  data: () => (balance === undefined ? undefined : { balance }),
});

const orderSnap = (data: Record<string, unknown> | undefined) => ({
  exists: true,
  data: () => data,
});

const input = (overrides: Record<string, unknown> = {}) => ({
  requestRef: requestRef as never,
  paymentOrderRef: paymentOrderRef as never,
  paymentOrder,
  requestId: "req-1",
  orderID: "order-1",
  captureId: "capture-1",
  capturedAmount: 84.7,
  capturedCurrency: "USD",
  expectedPayPalAmount: 84.7,
  ...overrides,
});

let consoleError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  mocks.txGet.mockReset();
  mocks.txSet.mockReset();
  mocks.txUpdate.mockReset();
  mocks.runTransaction
    .mockReset()
    .mockImplementation(async (callback: (transaction: unknown) => unknown) =>
      callback({
        get: mocks.txGet,
        set: mocks.txSet,
        update: mocks.txUpdate,
      })
    );
  consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("settleMainPayment", () => {
  it("deducts the wallet part and marks the request paid", async () => {
    mocks.txGet
      .mockResolvedValueOnce(walletSnap(100))
      .mockResolvedValueOnce(
        orderSnap({ ...paymentOrder, status: "capturing" })
      )
      .mockResolvedValueOnce({ exists: true });

    await expect(settleMainPayment(input())).resolves.toEqual({
      ok: true,
      paymentMethod: "wallet_and_paypal",
      walletApplied: 20,
      totalRequired: 104.7,
      baseAmount: 100,
    });

    expect(mocks.txSet).toHaveBeenCalledWith(
      expect.objectContaining({ __kind: "wallets" }),
      {
        balance: 80,
        balanceMinor: 8000,
        reserved: 0,
        reservedMinor: 0,
        currency: "USD",
        updatedAt: "__SERVER_TS__",
      },
      { merge: true }
    );
    expect(mocks.txSet).toHaveBeenCalledWith(
      expect.objectContaining({
        __kind: "walletTransactions",
        id: "paypal_capture-1",
      }),
      {
        userId: "user-1",
        type: "payment",
        amount: -20,
        balanceAfter: 80,
        amountMinor: -2000,
        balanceAfterMinor: 8000,
        requestId: "req-1",
        description: "Request Payment",
        createdAt: "__SERVER_TS__",
      }
    );
    expect(mocks.txUpdate).toHaveBeenCalledWith(requestRef, {
      status: "paid",
      payment: {
        provider: "wallet_and_paypal",
        paymentMethod: "wallet_and_paypal",
        orderId: "order-1",
        captureId: "capture-1",
        amount: 104.7,
        amountPaid: 104.7,
        paypalAmount: 84.7,
        walletAmount: 20,
        quoteAmount: 100,
        currency: "USD",
        status: "completed",
        paidAt: "__SERVER_TS__",
      },
      updatedAt: "__SERVER_TS__",
    });
    expect(mocks.txUpdate).toHaveBeenCalledWith(paymentOrderRef, {
      status: "completed",
      captureId: "capture-1",
      capturedAmount: 84.7,
      capturedCurrency: "USD",
      completedAt: "__SERVER_TS__",
    });
  });

  it("keeps the wallet's own currency", async () => {
    mocks.txGet
      .mockResolvedValueOnce({
        exists: true,
        data: () => ({ balance: 100, currency: "INR" }),
      })
      .mockResolvedValueOnce(orderSnap(paymentOrder))
      .mockResolvedValueOnce({ exists: true });

    await settleMainPayment(input());

    expect(mocks.txSet.mock.calls[0][1].currency).toBe("INR");
  });

  it("does not touch the wallet for a PayPal-only payment", async () => {
    mocks.txGet
      .mockResolvedValueOnce(walletSnap(undefined))
      .mockResolvedValueOnce(
        orderSnap({ ...paymentOrder, walletApplied: 0, totalRequired: 84.7 })
      )
      .mockResolvedValueOnce({ exists: true });

    await expect(
      settleMainPayment(
        input({
          paymentOrder: {
            ...paymentOrder,
            walletApplied: 0,
            totalRequired: 84.7,
          },
          expectedPayPalAmount: 84.7,
        })
      )
    ).resolves.toMatchObject({ ok: true, paymentMethod: "paypal" });

    expect(mocks.txSet).not.toHaveBeenCalled();
    expect(mocks.txUpdate.mock.calls[0][1].payment.provider).toBe("paypal");
  });

  it("treats an order another attempt completed as settled", async () => {
    mocks.txGet
      .mockResolvedValueOnce(walletSnap(100))
      .mockResolvedValueOnce(
        orderSnap({ ...paymentOrder, status: "completed" })
      )
      .mockResolvedValueOnce({ exists: true });

    await expect(settleMainPayment(input())).resolves.toMatchObject({
      ok: true,
    });

    expect(mocks.txSet).not.toHaveBeenCalled();
    expect(mocks.txUpdate).not.toHaveBeenCalled();
  });

  it("refuses a stored calculation with no money in it", async () => {
    await expect(
      settleMainPayment(
        input({ paymentOrder: { ...paymentOrder, baseAmount: 0 } })
      )
    ).resolves.toEqual({
      ok: false,
      status: 400,
      error: "The stored payment calculation is invalid.",
    });
    expect(mocks.runTransaction).not.toHaveBeenCalled();
  });

  it("refuses a stored calculation with no total", async () => {
    await expect(
      settleMainPayment(
        input({ paymentOrder: { ...paymentOrder, totalRequired: 0 } })
      )
    ).resolves.toMatchObject({
      error: "The stored payment calculation is invalid.",
    });
  });

  it("refuses when total minus wallet is not the PayPal amount", async () => {
    await expect(
      settleMainPayment(
        input({ paymentOrder: { ...paymentOrder, walletApplied: 0 } })
      )
    ).resolves.toEqual({
      ok: false,
      status: 400,
      error: "The stored payment calculation could not be verified.",
    });
    expect(consoleError).toHaveBeenCalledWith(
      "Stored payment calculation mismatch:",
      expect.objectContaining({
        baseAmount: 100,
        totalRequired: 104.7,
        walletApplied: 0,
        calculatedPayPalAmount: 104.7,
        expectedPayPalAmount: 84.7,
        orderID: "order-1",
      })
    );
  });

  it("throws when the payment order disappeared mid-transaction", async () => {
    mocks.txGet
      .mockResolvedValueOnce(walletSnap(100))
      .mockResolvedValueOnce(orderSnap(undefined))
      .mockResolvedValueOnce({ exists: true });

    await expect(settleMainPayment(input())).rejects.toThrow(
      "PayPal payment order could not be found."
    );
  });

  it("throws when the order changed hands", async () => {
    mocks.txGet
      .mockResolvedValueOnce(walletSnap(100))
      .mockResolvedValueOnce(orderSnap({ ...paymentOrder, userId: "user-2" }))
      .mockResolvedValueOnce({ exists: true });

    await expect(settleMainPayment(input())).rejects.toThrow(
      "Payment ownership verification failed."
    );
  });

  it("throws when the wallet no longer covers its share", async () => {
    mocks.txGet
      .mockResolvedValueOnce(walletSnap(5))
      .mockResolvedValueOnce(orderSnap(paymentOrder))
      .mockResolvedValueOnce({ exists: true });

    await expect(settleMainPayment(input())).rejects.toThrow(
      "Insufficient wallet balance to complete this payment."
    );
  });
});
