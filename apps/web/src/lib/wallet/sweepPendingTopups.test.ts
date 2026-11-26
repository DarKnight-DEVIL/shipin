import { describe, expect, it, vi } from "vitest";

import { sweepPendingTopups, type StuckTopup, type TopupSweepDeps } from "./sweepPendingTopups";

function topup(id: string, data: Record<string, unknown> = {}): StuckTopup {
  return {
    id,
    ref: { id } as unknown as StuckTopup["ref"],
    data: { orderId: `PP-${id}`, userId: "user-1", amount: 40, ...data },
  };
}

function completed(value = "40.00") {
  return {
    status: "COMPLETED",
    purchase_units: [
      {
        payments: {
          captures: [
            { id: "CAP-1", status: "COMPLETED", amount: { value, currency_code: "USD" } },
          ],
        },
      },
    ],
  };
}

function deps(overrides: Partial<TopupSweepDeps> = {}): TopupSweepDeps {
  return {
    listPendingTopups: async () => [],
    fetchOrder: async () => ({ status: "CREATED" }),
    credit: vi.fn(async () => ({ ok: true as const, alreadyProcessed: false })),
    markAbandoned: vi.fn(async () => {}),
    ...overrides,
  };
}

describe("sweepPendingTopups", () => {
  it("credits a top-up PayPal captured but nobody credited", async () => {
    // `capturePending: true` was the only trace of this charge, and nothing in
    // the app acted on it: the customer paid and the balance never moved.
    const d = deps({
      listPendingTopups: async () => [topup("T1")],
      fetchOrder: async () => completed("40.00"),
    });

    const result = await sweepPendingTopups(d);

    expect(result).toMatchObject({ scanned: 1, credited: 1, alreadyCredited: 0 });
    expect(d.credit).toHaveBeenCalledWith(expect.objectContaining({ id: "T1" }), {
      captureId: "CAP-1",
      amount: 40,
      currency: "USD",
    });
  });

  it("reports an already-credited capture separately from a new credit", async () => {
    // The difference matters operationally: a re-credit means the ledger lost an
    // entry, while an alreadyProcessed result means a previous run was overtaken.
    const d = deps({
      listPendingTopups: async () => [topup("T2")],
      fetchOrder: async () => completed(),
      credit: vi.fn(async () => ({ ok: true as const, alreadyProcessed: true })),
    });

    const result = await sweepPendingTopups(d);

    expect(result).toMatchObject({ credited: 0, alreadyCredited: 1 });
  });

  it("leaves a capture still in flight alone", async () => {
    const d = deps({
      listPendingTopups: async () => [topup("T3")],
      fetchOrder: async () => ({ status: "APPROVED" }),
    });

    const result = await sweepPendingTopups(d);

    expect(result.pending).toBe(1);
    expect(d.credit).not.toHaveBeenCalled();
  });

  it("clears the flag when PayPal never took the money", async () => {
    const d = deps({
      listPendingTopups: async () => [topup("T4")],
      fetchOrder: async () => ({ status: "VOIDED" }),
    });

    const result = await sweepPendingTopups(d);

    expect(result.abandoned).toBe(1);
    expect(d.markAbandoned).toHaveBeenCalledTimes(1);
  });

  it("keeps going when one order cannot be settled", async () => {
    const d = deps({
      listPendingTopups: async () => [topup("T5"), topup("T6")],
      fetchOrder: async () => completed(),
      credit: vi.fn(async (t: StuckTopup) =>
        t.id === "T5"
          ? { ok: false as const, error: "Captured amount does not match." }
          : { ok: true as const, alreadyProcessed: false }
      ),
    });

    const result = await sweepPendingTopups(d);

    expect(result.credited).toBe(1);
    expect(result.failures).toEqual([
      { topupId: "T5", error: "Captured amount does not match." },
    ]);
  });

  it("keeps going when settleWalletTopup itself throws", async () => {
    /*
     * The credit call is awaited inside the loop's try, so a throw from it - a Firestore
     * write failing, say - must land in `failures` like a refused settlement does, and
     * must not stop the remaining top-ups from being drained.
     */
    const d = deps({
      listPendingTopups: async () => [topup("T7"), topup("T8")],
      fetchOrder: async () => completed(),
      credit: vi.fn(async (t: StuckTopup) => {
        if (t.id === "T7") throw new Error("firestore write failed");
        return { ok: true as const, alreadyProcessed: false };
      }),
    });

    const result = await sweepPendingTopups(d);

    expect(result.credited).toBe(1);
    expect(result.failures).toEqual([
      { topupId: "T7", error: "firestore write failed" },
    ]);
  });

  it("reports a completed order whose capture cannot be read", async () => {
    const d = deps({
      listPendingTopups: async () => [topup("T7")],
      fetchOrder: async () => ({ status: "COMPLETED" }),
    });

    const result = await sweepPendingTopups(d);

    expect(result.failures[0].topupId).toBe("T7");
    expect(d.credit).not.toHaveBeenCalled();
  });

  it("distinguishes an empty sweep from a failed one", async () => {
    const result = await sweepPendingTopups(deps());

    expect(result).toEqual({
      scanned: 0,
      credited: 0,
      alreadyCredited: 0,
      abandoned: 0,
      pending: 0,
      failures: [],
    });
  });
});
