/**
 * Unit tests for the 004-strip-money-decimals migration.
 *
 * This migration deletes data, so the tests are mostly about what it refuses to
 * delete: a decimal with no valid integer beside it, and a decimal that disagrees
 * with its integer. Either would be an unrecoverable way to lose a balance.
 */

import { describe, expect, it, vi } from "vitest";

vi.mock("firebase-admin/firestore", async (importOriginal) => {
  const actual = await importOriginal<typeof import("firebase-admin/firestore")>();
  return {
    ...actual,
    FieldValue: { ...actual.FieldValue, delete: () => "__DELETE__" },
  };
});

import { planDocument } from "./004-strip-money-decimals";

const WALLET = ["balance", "reserved"] as const;
const LEDGER = ["amount", "balanceAfter"] as const;

describe("planDocument — wallets", () => {
  it("removes both decimals when the integers agree", () => {
    expect(
      planDocument(
        { balance: 84.7, balanceMinor: 8470, reserved: 20, reservedMinor: 2000 },
        WALLET
      )
    ).toEqual({
      remove: { balance: "__DELETE__", reserved: "__DELETE__" },
      incompleteFields: [],
      mismatches: [],
    });
  });

  it("removes only the field that is still decimal", () => {
    expect(
      planDocument({ balance: 10, balanceMinor: 1000, reservedMinor: 0 }, WALLET)
    ).toEqual({
      remove: { balance: "__DELETE__" },
      incompleteFields: [],
      mismatches: [],
    });
  });

  it("refuses to delete a decimal that has no integer beside it", () => {
    // Without balanceMinor, `balance` is the only record of the money. Deleting
    // it makes the wallet worth nothing.
    expect(planDocument({ balance: 84.7 }, WALLET)).toEqual({
      remove: {},
      incompleteFields: ["balance"],
      mismatches: [],
    });
  });

  it("refuses to delete a decimal whose integer is not an integer", () => {
    for (const bad of [84.7, "8470", Number.NaN, null]) {
      expect(
        planDocument({ balance: 84.7, balanceMinor: bad }, WALLET).incompleteFields
      ).toEqual(["balance"]);
    }
  });

  it("refuses to delete when the two disagree, and reports it", () => {
    // The last chance to notice a bad write; removing the decimal would erase the
    // evidence.
    expect(planDocument({ balance: 10, balanceMinor: 999 }, WALLET)).toEqual({
      remove: {},
      incompleteFields: [],
      mismatches: ["balanceMinor"],
    });
  });

  it("tolerates the float tail the earlier backfill tolerated", () => {
    expect(
      planDocument({ balance: 84.69999999999999, balanceMinor: 8470 }, WALLET).remove
    ).toEqual({ balance: "__DELETE__" });
  });

  it("is idempotent: a stripped document needs nothing", () => {
    expect(planDocument({ balanceMinor: 8470, reservedMinor: 0 }, WALLET)).toEqual({
      remove: {},
      incompleteFields: [],
      mismatches: [],
    });
  });

  it("ignores a document with no money fields at all", () => {
    expect(planDocument({ currency: "USD" }, WALLET).remove).toEqual({});
  });
});

describe("planDocument — ledger rows", () => {
  it("removes both amounts when the integers agree", () => {
    expect(
      planDocument(
        {
          amount: -20,
          amountMinor: -2000,
          balanceAfter: 80,
          balanceAfterMinor: 8000,
        },
        LEDGER
      )
    ).toEqual({
      remove: { amount: "__DELETE__", balanceAfter: "__DELETE__" },
      incompleteFields: [],
      mismatches: [],
    });
  });

  it("strips the ready field and keeps the one without an integer", () => {
    // One field of a row can be migrated while the other is not; each is
    // independent money, so progress is safe and the leftover is reported.
    expect(
      planDocument({ amount: 19.99, amountMinor: 1999, balanceAfter: 5 }, LEDGER)
    ).toEqual({
      remove: { amount: "__DELETE__" },
      incompleteFields: ["balanceAfter"],
      mismatches: [],
    });
  });

  it("keeps a historical row that never had an integer", () => {
    expect(planDocument({ amount: 12.5, balanceAfter: 12.5 }, LEDGER)).toEqual({
      remove: {},
      incompleteFields: ["amount", "balanceAfter"],
      mismatches: [],
    });
  });
});
