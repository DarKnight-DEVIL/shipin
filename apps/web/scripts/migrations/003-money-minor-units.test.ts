/**
 * Unit tests for the 003-money-minor-units migration.
 *
 * The migration's risk is entirely in `planDocument`: whether it skips a
 * document it has already converted, refuses to zero an unreadable amount, and
 * leaves an existing integer alone. Those are decided without Firestore, so they
 * are tested here rather than against a live database.
 */

import { describe, expect, it } from "vitest";

import { planDocument } from "./003-money-minor-units";

const WALLET = ["balance"] as const;
const LEDGER = ["amount", "balanceAfter"] as const;

describe("planDocument — wallets", () => {
  it("backfills the minor field from a legacy decimal", () => {
    expect(planDocument({ balance: 84.7 }, WALLET)).toEqual({
      update: { balanceMinor: 8470 },
      mismatches: [],
    });
  });

  it("tolerates the float tail Firestore and JSON add", () => {
    expect(planDocument({ balance: 84.69999999999999 }, WALLET)).toEqual({
      update: { balanceMinor: 8470 },
      mismatches: [],
    });
  });

  it("is idempotent: a converted document needs nothing", () => {
    expect(planDocument({ balance: 84.7, balanceMinor: 8470 }, WALLET)).toEqual(
      { update: {}, skipped: "already-migrated", mismatches: [] }
    );
  });

  it("keeps an existing integer even when it disagrees, and reports it", () => {
    // The integer is authoritative per ADR-0008. Rewriting it from the decimal
    // would hide the disagreement an operator needs to see.
    expect(planDocument({ balance: 10, balanceMinor: 999 }, WALLET)).toEqual({
      update: {},
      skipped: "already-migrated",
      mismatches: ["balanceMinor"],
    });
  });

  it("converts a zero balance, which is real money and not a missing value", () => {
    expect(planDocument({ balance: 0 }, WALLET)).toEqual({
      update: { balanceMinor: 0 },
      mismatches: [],
    });
  });

  it("refuses to write zero over an amount it cannot read", () => {
    // A wallet whose balance is NaN or a malformed string is a bug; writing 0
    // would erase the evidence and the money with it.
    expect(planDocument({ balance: Number.NaN }, WALLET).skipped).toBe(
      "unreadable"
    );
    expect(planDocument({ balance: "not money" }, WALLET).skipped).toBe(
      "unreadable"
    );
    expect(planDocument({ balance: "not money" }, WALLET).update).toEqual({});
  });

  it("ignores a document that never held the field", () => {
    expect(planDocument({}, WALLET)).toEqual({
      update: {},
      skipped: "already-migrated",
      mismatches: [],
    });
    expect(planDocument({ balance: null }, WALLET).update).toEqual({});
  });

  it("reads a decimal stored as a numeric string", () => {
    expect(planDocument({ balance: "84.70" }, WALLET).update).toEqual({
      balanceMinor: 8470,
    });
  });
});

describe("planDocument — ledger rows", () => {
  it("converts both amount fields, negative amounts included", () => {
    expect(
      planDocument({ amount: -20, balanceAfter: 30 }, LEDGER)
    ).toEqual({
      update: { amountMinor: -2000, balanceAfterMinor: 3000 },
      mismatches: [],
    });
  });

  it("converts only the field that needs it", () => {
    expect(
      planDocument({ amount: 19.99, amountMinor: 1999, balanceAfter: 5 }, LEDGER)
    ).toEqual({
      update: { balanceAfterMinor: 500 },
      mismatches: [],
    });
  });

  it("leaves a row with no amounts alone", () => {
    expect(planDocument({ type: "deposit" }, LEDGER)).toEqual({
      update: {},
      skipped: "already-migrated",
      mismatches: [],
    });
  });
});
