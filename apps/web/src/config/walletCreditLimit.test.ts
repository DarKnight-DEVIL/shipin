// @vitest-environment node

/**
 * The admin wallet-credit rail.
 *
 * A credit is money created by hand, so this number's failure modes are money bugs:
 * a typo in the environment must not remove the limit, and a stray zero in a config
 * edit must not raise it to "effectively off". The default has to be the tighter
 * answer in every case where the value cannot be trusted.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  DEFAULT_WALLET_CREDIT_MAX,
  HARD_WALLET_CREDIT_MAX,
  walletCreditMax,
} from "./walletCreditLimit";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("walletCreditMax", () => {
  it("defaults to 10,000 when the variable is unset or blank", () => {
    vi.stubEnv("WALLET_CREDIT_MAX", "");
    expect(walletCreditMax()).toBe(10_000);
    expect(DEFAULT_WALLET_CREDIT_MAX).toBe(10_000);
  });

  it("honours a configured limit for a deployment that needs more room", () => {
    vi.stubEnv("WALLET_CREDIT_MAX", "50000");
    expect(walletCreditMax()).toBe(50_000);
  });

  it("floors a fractional limit rather than allowing a fractional cap", () => {
    vi.stubEnv("WALLET_CREDIT_MAX", "2500.9");
    expect(walletCreditMax()).toBe(2500);
  });

  it("treats an unusable value as unset", () => {
    // Each of these would remove the rail entirely if it were used as-is: NaN makes
    // every comparison false, and a negative cap would reject every credit.
    for (const value of ["abc", "NaN", "Infinity", "0", "-100", " "]) {
      vi.stubEnv("WALLET_CREDIT_MAX", value);
      expect(walletCreditMax(), value).toBe(DEFAULT_WALLET_CREDIT_MAX);
    }
  });

  it("clamps a limit that would turn the rail off", () => {
    vi.stubEnv("WALLET_CREDIT_MAX", "999999999999");
    expect(walletCreditMax()).toBe(HARD_WALLET_CREDIT_MAX);
  });

  it("accepts the hard ceiling itself", () => {
    vi.stubEnv("WALLET_CREDIT_MAX", String(HARD_WALLET_CREDIT_MAX));
    expect(walletCreditMax()).toBe(HARD_WALLET_CREDIT_MAX);
  });
});
