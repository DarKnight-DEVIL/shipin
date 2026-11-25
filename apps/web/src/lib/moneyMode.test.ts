/**
 * The switch that decides whether a wallet write carries the decimal fields.
 *
 * The failure this guards against is quiet: writing only `balanceMinor` while a
 * reader in the old shape is still deployed shows a customer an empty wallet, and
 * writing only `balance` while phase 4's reader is deployed does the same. Both
 * directions are pinned here so the flag cannot be flipped into a half state
 * without a test noticing.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  balanceFields,
  isMinorOnlyMode,
  ledgerFields,
  reservedFields,
} from "./moneyMode";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("isMinorOnlyMode", () => {
  it("is off by default", () => {
    vi.stubEnv("MONEY_MINOR_ONLY", "");
    expect(isMinorOnlyMode()).toBe(false);
  });

  it("is off for any value other than the exact string 1", () => {
    for (const value of ["0", "true", "yes", " 1"]) {
      vi.stubEnv("MONEY_MINOR_ONLY", value);
      expect(isMinorOnlyMode(), value).toBe(false);
    }
  });

  it("is on for 1", () => {
    vi.stubEnv("MONEY_MINOR_ONLY", "1");
    expect(isMinorOnlyMode()).toBe(true);
  });
});

describe("balanceFields", () => {
  it("writes both representations while the flag is off", () => {
    vi.stubEnv("MONEY_MINOR_ONLY", "");
    expect(balanceFields(8470)).toEqual({ balance: 84.7, balanceMinor: 8470 });
  });

  it("writes only the integer once the flag is on", () => {
    vi.stubEnv("MONEY_MINOR_ONLY", "1");
    expect(balanceFields(8470)).toEqual({ balanceMinor: 8470 });
  });

  it("does not let a float tail into either representation", () => {
    vi.stubEnv("MONEY_MINOR_ONLY", "");
    expect(balanceFields(8470)).toEqual({ balance: 84.7, balanceMinor: 8470 });
    expect(balanceFields(0)).toEqual({ balance: 0, balanceMinor: 0 });
  });
});

describe("ledgerFields", () => {
  it("writes amount and balanceAfter in both representations", () => {
    vi.stubEnv("MONEY_MINOR_ONLY", "");
    expect(ledgerFields(-2000, 8000)).toEqual({
      amount: -20,
      amountMinor: -2000,
      balanceAfter: 80,
      balanceAfterMinor: 8000,
    });
  });

  it("drops the decimals once the flag is on", () => {
    vi.stubEnv("MONEY_MINOR_ONLY", "1");
    expect(ledgerFields(-2000, 8000)).toEqual({
      amountMinor: -2000,
      balanceAfterMinor: 8000,
    });
  });
});

describe("reservedFields", () => {
  it("carries the reservation in both shapes, and only the integer when on", () => {
    vi.stubEnv("MONEY_MINOR_ONLY", "");
    expect(reservedFields(2000)).toEqual({ reserved: 20, reservedMinor: 2000 });

    vi.stubEnv("MONEY_MINOR_ONLY", "1");
    expect(reservedFields(2000)).toEqual({ reservedMinor: 2000 });
  });
});
