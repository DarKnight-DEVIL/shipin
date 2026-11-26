import { describe, expect, it, vi } from "vitest";

import {
  readCompletedCapture,
  readOrderState,
  sweepPendingPayments,
  type StuckPaymentOrder,
  type SweepDeps,
} from "./sweepPendingPayments";

function order(id: string, data: Record<string, unknown> = {}): StuckPaymentOrder {
  return {
    id,
    ref: { id } as unknown as StuckPaymentOrder["ref"],
    data: { paymentType: "main", ...data },
  };
}

function completedOrder(captureId = "CAP-1", value = "42.00") {
  return {
    status: "COMPLETED",
    purchase_units: [
      {
        payments: {
          captures: [
            {
              id: captureId,
              status: "COMPLETED",
              amount: { value, currency_code: "USD" },
            },
          ],
        },
      },
    ],
  };
}

function deps(overrides: Partial<SweepDeps> = {}): SweepDeps {
  return {
    listStuckOrders: async () => [],
    fetchOrder: async () => ({ status: "CREATED" }),
    settleMain: vi.fn(async () => ({ ok: true })),
    settleAdditionalItem: vi.fn(async () => ({ ok: true })),
    markVoided: vi.fn(async () => {}),
    ...overrides,
  };
}

describe("readCompletedCapture", () => {
  it("reads the completed capture with its amount", () => {
    expect(readCompletedCapture(completedOrder("CAP-9", "12.34"))).toEqual({
      captureId: "CAP-9",
      amount: 12.34,
      currency: "USD",
    });
  });

  it("ignores captures PayPal has not completed", () => {
    const payload = {
      status: "APPROVED",
      purchase_units: [
        {
          payments: {
            captures: [
              { id: "CAP-1", status: "PENDING", amount: { value: "5.00" } },
            ],
          },
        },
      ],
    };

    expect(readCompletedCapture(payload)).toBeNull();
  });

  it("returns null rather than inventing an amount", () => {
    // A completed order with no capture is a shape this code does not
    // understand; settling on a guessed value would be worse than reporting it.
    expect(readCompletedCapture({ status: "COMPLETED" })).toBeNull();
    expect(readCompletedCapture(completedOrder("CAP-1", "abc"))).toBeNull();
    expect(readCompletedCapture(null)).toBeNull();
  });
});

describe("readOrderState", () => {
  it("normalises the PayPal state", () => {
    expect(readOrderState({ status: "completed" })).toBe("COMPLETED");
    expect(readOrderState({})).toBe("");
    expect(readOrderState(null)).toBe("");
  });
});

describe("sweepPendingPayments", () => {
  it("settles an order PayPal captured but the app never recorded", async () => {
    // The failure this exists for: browser closes mid-capture, webhook retries
    // give up, and the customer is charged while the request stays unpaid.
    const d = deps({
      listStuckOrders: async () => [order("ORDER-1")],
      fetchOrder: async () => completedOrder("CAP-1", "42.00"),
    });

    const result = await sweepPendingPayments(d);

    expect(result).toMatchObject({ scanned: 1, settled: 1, voided: 0, pending: 0 });
    expect(d.settleMain).toHaveBeenCalledWith({
      paymentOrder: expect.objectContaining({ id: "ORDER-1" }),
      capture: { captureId: "CAP-1", amount: 42, currency: "USD" },
    });
  });

  it("routes an additional-item order to its own settlement", async () => {
    const d = deps({
      listStuckOrders: async () => [order("ORDER-2", { paymentType: "additional_item" })],
      fetchOrder: async () => completedOrder(),
    });

    await sweepPendingPayments(d);

    expect(d.settleAdditionalItem).toHaveBeenCalledTimes(1);
    expect(d.settleMain).not.toHaveBeenCalled();
  });

  it("leaves an in-progress order alone instead of guessing", async () => {
    const d = deps({
      listStuckOrders: async () => [
        order("ORDER-3"),
        order("ORDER-4"),
      ],
      fetchOrder: async (id: string) => ({
        status: id === "ORDER-3" ? "APPROVED" : "PAYER_ACTION_REQUIRED",
      }),
    });

    const result = await sweepPendingPayments(d);

    expect(result).toMatchObject({ scanned: 2, settled: 0, pending: 2 });
    expect(d.settleMain).not.toHaveBeenCalled();
    expect(d.markVoided).not.toHaveBeenCalled();
  });

  it("stops polling an order PayPal voided", async () => {
    const d = deps({
      listStuckOrders: async () => [order("ORDER-5")],
      fetchOrder: async () => ({ status: "VOIDED" }),
    });

    const result = await sweepPendingPayments(d);

    expect(result.voided).toBe(1);
    expect(d.markVoided).toHaveBeenCalledTimes(1);
  });

  it("reports a completed order it could not settle, and keeps going", async () => {
    const d = deps({
      listStuckOrders: async () => [order("ORDER-6"), order("ORDER-7")],
      fetchOrder: async (id: string) =>
        id === "ORDER-6" ? completedOrder("CAP-6") : completedOrder("CAP-7"),
      settleMain: vi.fn(async ({ paymentOrder }: { paymentOrder: StuckPaymentOrder }) =>
        paymentOrder.id === "ORDER-6"
          ? { ok: false, error: "Amount mismatch." }
          : { ok: true }
      ),
    });

    const result = await sweepPendingPayments(d);

    expect(result.settled).toBe(1);
    expect(result.failures).toEqual([
      { orderId: "ORDER-6", error: "Amount mismatch." },
    ]);
  });

  it("isolates a PayPal lookup that throws", async () => {
    const d = deps({
      listStuckOrders: async () => [order("ORDER-8"), order("ORDER-9")],
      fetchOrder: async (id: string) => {
        if (id === "ORDER-8") throw new Error("paypal 500");
        return completedOrder("CAP-9");
      },
    });

    const result = await sweepPendingPayments(d);

    expect(result.settled).toBe(1);
    expect(result.failures[0]).toEqual({ orderId: "ORDER-8", error: "paypal 500" });
  });

  it("distinguishes an empty sweep from a failed one", async () => {
    // Nothing stuck is the healthy state; it must not look like an error.
    const result = await sweepPendingPayments(deps());

    expect(result).toEqual({
      scanned: 0,
      settled: 0,
      voided: 0,
      pending: 0,
      failures: [],
    });
  });
});
