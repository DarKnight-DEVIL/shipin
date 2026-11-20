import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("firebase-admin/firestore", () => ({
  FieldValue: {
    serverTimestamp: () => "__SERVER_TS__",
    arrayUnion: (value: unknown) => ({ __UNION: value }),
  },
}));

import { settleAdditionalItemPayment } from "./settleAdditionalItemPayment";

const requestRef = { id: "req-1", update: vi.fn() };
const paymentOrderRef = { id: "order-1", update: vi.fn() };

const awaitingItem = {
  id: "item-1",
  status: "awaiting_payment",
  totalDue: 20,
  unitPrice: 20,
  subtotal: 20,
  item: { name: "Phone case", quantity: 1, url: "https://cdn.test/case.png" },
};

const input = (overrides: Record<string, unknown> = {}) => ({
  requestRef: requestRef as never,
  paymentOrderRef: paymentOrderRef as never,
  requestData: { additionalItemRequests: [awaitingItem] },
  paymentOrder: { baseAmount: 20 },
  additionalItemRequestId: "item-1",
  orderID: "order-1",
  captureId: "capture-1",
  capturedAmount: 20,
  capturedCurrency: "USD",
  ...overrides,
});

let consoleError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  requestRef.update.mockReset().mockResolvedValue(undefined);
  paymentOrderRef.update.mockReset().mockResolvedValue(undefined);
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

    const [requestUpdate] = requestRef.update.mock.calls[0];
    const paidItem = requestUpdate.additionalItemRequests[0];

    expect(paidItem).toMatchObject({
      id: "item-1",
      status: "paid",
      amountPaid: 20,
    });
    expect(paidItem.paidAt).toBeInstanceOf(Date);
    expect(requestUpdate.items).toEqual({
      __UNION: {
        name: "Phone case",
        url: "https://cdn.test/case.png",
        quantity: 1,
        unitPrice: 20,
        subtotal: 20,
      },
    });
    expect(requestUpdate.additionalPayments.__UNION).toMatchObject({
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
    expect(requestUpdate.updatedAt).toBe("__SERVER_TS__");

    expect(paymentOrderRef.update).toHaveBeenCalledWith({
      status: "completed",
      captureId: "capture-1",
      capturedAmount: 20,
      capturedCurrency: "USD",
      completedAt: "__SERVER_TS__",
    });
  });

  it("leaves the other add-ons untouched", async () => {
    const other = { id: "item-2", status: "awaiting_payment", totalDue: 5 };

    await settleAdditionalItemPayment(
      input({ requestData: { additionalItemRequests: [awaitingItem, other] } })
    );

    const [requestUpdate] = requestRef.update.mock.calls[0];

    expect(requestUpdate.additionalItemRequests).toHaveLength(2);
    expect(requestUpdate.additionalItemRequests[1]).toEqual(other);
  });

  it("defaults a missing url to an empty string", async () => {
    await settleAdditionalItemPayment(
      input({
        requestData: {
          additionalItemRequests: [
            { ...awaitingItem, item: { name: "Sticker", quantity: 2 } },
          ],
        },
      })
    );

    expect(requestRef.update.mock.calls[0][0].items.__UNION.url).toBe("");
  });

  it("fails for an unknown add-on", async () => {
    await expect(
      settleAdditionalItemPayment(input({ additionalItemRequestId: "nope" }))
    ).resolves.toEqual({
      ok: false,
      status: 404,
      error: "Additional item request could not be found.",
    });
    expect(requestRef.update).not.toHaveBeenCalled();
  });

  it("fails for an add-on that is not awaiting payment", async () => {
    await expect(
      settleAdditionalItemPayment(
        input({
          requestData: {
            additionalItemRequests: [{ ...awaitingItem, status: "paid" }],
          },
        })
      )
    ).resolves.toMatchObject({
      status: 400,
      error: "This additional item is not awaiting payment.",
    });
  });

  it("fails when the stored amount and the add-on disagree", async () => {
    await expect(
      settleAdditionalItemPayment(input({ paymentOrder: { baseAmount: 19.5 } }))
    ).resolves.toMatchObject({
      status: 400,
      error: "The additional item payment amount could not be verified.",
    });
    expect(consoleError).toHaveBeenCalledWith(
      "Additional item base amount mismatch:",
      { storedBaseAmount: 19.5, additionalItemTotal: 20, orderID: "order-1" }
    );
    expect(paymentOrderRef.update).not.toHaveBeenCalled();
  });

  it("handles a request with no add-on array", async () => {
    await expect(
      settleAdditionalItemPayment(input({ requestData: {} }))
    ).resolves.toMatchObject({
      status: 404,
      error: "Additional item request could not be found.",
    });
  });
});
