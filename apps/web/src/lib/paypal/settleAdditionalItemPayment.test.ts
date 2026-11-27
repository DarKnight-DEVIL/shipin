import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { DocumentReference } from "firebase-admin/firestore";

vi.mock("firebase-admin/firestore", () => ({
  FieldValue: {
    serverTimestamp: () => "__SERVER_TS__",
    arrayUnion: (value: unknown) => ({ __UNION: value }),
  },
}));

import { settleAdditionalItemPayment } from "./settleAdditionalItemPayment";

const awaitingItem = {
  id: "item-1",
  status: "awaiting_payment",
  totalDue: 20,
  unitPrice: 20,
  subtotal: 20,
  item: { name: "Phone case", quantity: 1, url: "https://cdn.test/case.png" },
};

const snap = (data: Record<string, unknown>) => ({
  exists: true,
  data: () => data,
});

const requestGet = vi.fn();
const requestUpdate = vi.fn();
const paymentOrderGet = vi.fn();
const paymentOrderUpdate = vi.fn();

const firestore = {
  runTransaction: async (fn: (tx: unknown) => unknown) =>
    fn({
      get: (ref: { id: string }) =>
        ref.id === "req-1" ? requestGet() : paymentOrderGet(),
      update: (ref: { id: string }, data: unknown) =>
        ref.id === "req-1" ? requestUpdate(data) : paymentOrderUpdate(data),
    }),
};

const requestRef = {
  id: "req-1",
  get: requestGet,
  update: requestUpdate,
  firestore,
} as unknown as DocumentReference;

const paymentOrderRef = {
  id: "order-1",
  get: paymentOrderGet,
  update: paymentOrderUpdate,
  firestore,
} as unknown as DocumentReference;

const input = (overrides: Record<string, unknown> = {}) => ({
  requestRef,
  paymentOrderRef,
  additionalItemRequestId: "item-1",
  orderID: "order-1",
  captureId: "capture-1",
  capturedAmount: 20,
  capturedCurrency: "USD",
  ...overrides,
});

const requestSnapshot = (data: Record<string, unknown>) =>
  requestGet.mockResolvedValue(snap(data));

const orderSnapshot = (data: Record<string, unknown>) =>
  paymentOrderGet.mockResolvedValue(snap(data));

let consoleError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  requestUpdate.mockReset().mockResolvedValue(undefined);
  paymentOrderUpdate.mockReset().mockResolvedValue(undefined);
  requestGet
    .mockReset()
    .mockResolvedValue(snap({ additionalItemRequests: [awaitingItem] }));
  paymentOrderGet.mockReset().mockResolvedValue(snap({ baseAmount: 20 }));
  consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("settleAdditionalItemPayment", () => {
  it("marks the item paid, records the payment and completes the order", async () => {
    await expect(settleAdditionalItemPayment(input())).resolves.toEqual({
      ok: true,
    });

    const [requestWrite] = requestUpdate.mock.calls[0];
    const paidItem = requestWrite.additionalItemRequests[0];

    expect(paidItem).toMatchObject({
      id: "item-1",
      status: "paid",
      amountPaid: 20,
    });
    expect(paidItem.paidAt).toBeInstanceOf(Date);
    expect(requestWrite.items).toEqual({
      __UNION: {
        name: "Phone case",
        url: "https://cdn.test/case.png",
        quantity: 1,
        unitPrice: 20,
        subtotal: 20,
      },
    });
    expect(requestWrite.additionalPayments.__UNION).toMatchObject({
      id: "capture-1",
      additionalItemRequestId: "item-1",
      provider: "paypal",
      paymentMethod: "paypal",
      orderId: "order-1",
      captureId: "capture-1",
      amount: 20,
      currency: "USD",
      status: "completed",
    });
    expect(requestWrite.updatedAt).toBe("__SERVER_TS__");

    expect(paymentOrderUpdate).toHaveBeenCalledWith({
      status: "completed",
      captureId: "capture-1",
      capturedAmount: 20,
      capturedCurrency: "USD",
      completedAt: "__SERVER_TS__",
    });
  });

  it("leaves the other add-ons untouched", async () => {
    const other = { id: "item-2", status: "awaiting_payment", totalDue: 5 };
    requestSnapshot({ additionalItemRequests: [awaitingItem, other] });

    await settleAdditionalItemPayment(input());

    const [requestWrite] = requestUpdate.mock.calls[0];

    expect(requestWrite.additionalItemRequests).toHaveLength(2);
    expect(requestWrite.additionalItemRequests[1]).toEqual(other);
  });

  it("defaults a missing url to an empty string", async () => {
    requestSnapshot({
      additionalItemRequests: [
        { ...awaitingItem, item: { name: "Sticker", quantity: 2 } },
      ],
    });

    await settleAdditionalItemPayment(input());

    expect(requestUpdate.mock.calls[0][0].items.__UNION.url).toBe("");
  });

  it("fails for an unknown add-on", async () => {
    await expect(
      settleAdditionalItemPayment(input({ additionalItemRequestId: "nope" }))
    ).resolves.toEqual({
      ok: false,
      status: 404,
      error: "Additional item request could not be found.",
    });
    expect(requestUpdate).not.toHaveBeenCalled();
  });

  it("fails for an add-on that is not awaiting payment", async () => {
    requestSnapshot({
      additionalItemRequests: [{ ...awaitingItem, status: "paid" }],
    });

    await expect(settleAdditionalItemPayment(input())).resolves.toMatchObject({
      status: 400,
      error: "This additional item is not awaiting payment.",
    });
  });

  it("fails when the stored amount and the add-on disagree", async () => {
    orderSnapshot({ baseAmount: 19.5 });

    await expect(settleAdditionalItemPayment(input())).resolves.toMatchObject({
      status: 400,
      error: "The additional item payment amount could not be verified.",
    });
    expect(consoleError).toHaveBeenCalledWith(
      "Additional item base amount mismatch:",
      { storedBaseAmount: 19.5, additionalItemTotal: 20, orderID: "order-1" }
    );
    expect(paymentOrderUpdate).not.toHaveBeenCalled();
  });

  it("handles a request with no add-on array", async () => {
    requestSnapshot({});

    await expect(settleAdditionalItemPayment(input())).resolves.toMatchObject({
      status: 404,
      error: "Additional item request could not be found.",
    });
  });

  it("writes nothing when the payment order is missing", async () => {
    paymentOrderGet.mockResolvedValue({ exists: false, data: () => undefined });

    await expect(settleAdditionalItemPayment(input())).resolves.toMatchObject({
      status: 404,
      error: "Payment order could not be found.",
    });
    expect(requestUpdate).not.toHaveBeenCalled();
    expect(paymentOrderUpdate).not.toHaveBeenCalled();
  });
});
