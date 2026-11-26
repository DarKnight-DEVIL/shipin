import { describe, expect, it } from "vitest";

import { stableHash } from "../../src/lib/stableHash.ts";
import { collectRefundTransactions, up } from "./006-paypal-refund-transactions";

function fakeDb(requests: Record<string, Record<string, unknown>>) {
  const registry = new Map<string, Record<string, unknown>>();

  const db = {
    collection(name: string) {
      if (name === "requests") {
        return {
          orderBy: () => ({
            limit: () => ({
              startAfter: () => ({
                get: async () => ({ empty: true, size: 0, docs: [] }),
              }),
              get: async () => ({
                empty: Object.keys(requests).length === 0,
                size: Object.keys(requests).length,
                docs: Object.entries(requests).map(([id, data]) => ({
                  id,
                  data: () => data,
                })),
              }),
            }),
          }),
          doc: (id: string) => ({ id }),
        };
      }

      return {
        doc: (id: string) => ({
          get: async () => ({
            exists: registry.has(id),
            data: () => registry.get(id),
          }),
          set: async (data: Record<string, unknown>) => {
            registry.set(id, data);
          },
        }),
      };
    },
  };

  return { db: db as never, registry };
}

describe("collectRefundTransactions", () => {
  it("finds full and partial refund ids", () => {
    const records = collectRefundTransactions("req-1", {
      refundRequest: {
        paypalRefundTransactionId: "FULL-1",
        paypalRefundAmount: 25,
      },
      partialRefundOffer: {
        paypalRefundTransactionId: "PARTIAL-OFFER",
        paypalRefundAmount: 10,
      },
      partialRefunds: [
        { paypalRefundTransactionId: "PARTIAL-1", paypalRefundAmount: 5 },
        { paypalRefundTransactionId: "PARTIAL-OFFER", paypalRefundAmount: 5 },
      ],
    });

    expect(records).toEqual([
      {
        transactionId: "FULL-1",
        requestId: "req-1",
        kind: "full",
        amount: 25,
      },
      {
        transactionId: "PARTIAL-OFFER",
        requestId: "req-1",
        kind: "partial",
        amount: 10,
      },
      {
        transactionId: "PARTIAL-1",
        requestId: "req-1",
        kind: "partial",
        amount: 5,
      },
    ]);
  });

  it("ignores blank, malformed and missing ids", () => {
    expect(
      collectRefundTransactions("req-1", {
        refundRequest: { paypalRefundTransactionId: "  " },
        partialRefundOffer: { paypalRefundTransactionId: 42 },
        partialRefunds: [null, "nope", { paypalRefundTransactionId: "" }],
      })
    ).toEqual([]);
  });
});

describe("migration 006", () => {
  it("does not write during a dry run", async () => {
    const { db, registry } = fakeDb({
      "req-1": {
        partialRefunds: [
          { paypalRefundTransactionId: "PARTIAL-1", paypalRefundAmount: 5 },
        ],
      },
    });

    const result = await up(db, 450, true);

    expect(result).toEqual({ processed: 1, failed: 0 });
    expect(registry.size).toBe(0);
  });

  it("registers every refund id under its stable hash", async () => {
    const { db, registry } = fakeDb({
      "req-1": {
        refundRequest: {
          paypalRefundTransactionId: "FULL-1",
          paypalRefundAmount: 25,
        },
        partialRefunds: [
          { paypalRefundTransactionId: "PARTIAL-1", paypalRefundAmount: 5 },
        ],
      },
    });

    const result = await up(db);

    expect(result).toEqual({ processed: 1, failed: 0 });
    expect(registry.get(stableHash("FULL-1"))).toMatchObject({
      transactionId: "FULL-1",
      requestId: "req-1",
      kind: "full",
      amount: 25,
    });
    expect(registry.get(stableHash("PARTIAL-1"))).toMatchObject({
      transactionId: "PARTIAL-1",
      kind: "partial",
      amount: 5,
    });
  });

  it("leaves an already registered transaction alone", async () => {
    const { db, registry } = fakeDb({
      "req-1": {
        refundRequest: {
          paypalRefundTransactionId: "FULL-1",
          paypalRefundAmount: 25,
        },
      },
    });
    registry.set(stableHash("FULL-1"), {
      transactionId: "FULL-1",
      requestId: "req-0",
      kind: "partial",
      amount: 25,
    });

    await up(db);

    expect(registry.get(stableHash("FULL-1"))).toMatchObject({
      requestId: "req-0",
      kind: "partial",
    });
  });
});
