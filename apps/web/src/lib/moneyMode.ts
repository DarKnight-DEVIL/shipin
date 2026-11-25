/**
 * ADR-0008 phase 4, the switch half.
 *
 * Every wallet writer now produces both representations. This is the single
 * place that decides which of them gets written, so "stop writing the decimal"
 * is one environment variable and one function rather than six edits that can
 * drift apart.
 *
 *   MONEY_MINOR_ONLY unset (default)  write `balance` *and* `balanceMinor`
 *   MONEY_MINOR_ONLY=1                write `balanceMinor` only
 *
 * The flag is read at call time, not at module load, because a rolling deploy
 * has both shapes writing at once and because a test has to be able to set it.
 *
 * Readers deliberately keep understanding both shapes in either mode. The ADR
 * called for dropping that fallback; it is kept, because the fallback is what
 * makes a missed document (one the backfill never saw, or one written by the
 * previous deployment during the rollout) read as money instead of as zero. It
 * costs a `typeof` check and it is the difference between a stale field and a
 * customer looking at an empty wallet.
 */

import { toDecimal, type Minor } from "./money";

export function isMinorOnlyMode(): boolean {
  return process.env.MONEY_MINOR_ONLY === "1";
}

/** The wallet's balance fields, in whichever shape this deployment writes. */
export interface BalanceFields {
  balance?: number;
  balanceMinor: Minor;
}

/** A ledger row's amount and resulting balance, in the configured shape. */
export interface LedgerFields {
  amount?: number;
  amountMinor: Minor;
  balanceAfter?: number;
  balanceAfterMinor: Minor;
}

/** The reservation fields, in the configured shape. */
export interface ReservedFields {
  reserved?: number;
  reservedMinor: Minor;
}

export function balanceFields(minor: Minor): BalanceFields {
  if (isMinorOnlyMode()) return { balanceMinor: minor };

  return { balance: toDecimal(minor), balanceMinor: minor };
}

export function ledgerFields(
  amountMinor: Minor,
  balanceAfterMinor: Minor
): LedgerFields {
  if (isMinorOnlyMode()) return { amountMinor, balanceAfterMinor };

  return {
    amount: toDecimal(amountMinor),
    amountMinor,
    balanceAfter: toDecimal(balanceAfterMinor),
    balanceAfterMinor,
  };
}

export function reservedFields(minor: Minor): ReservedFields {
  if (isMinorOnlyMode()) return { reservedMinor: minor };

  return { reserved: toDecimal(minor), reservedMinor: minor };
}
