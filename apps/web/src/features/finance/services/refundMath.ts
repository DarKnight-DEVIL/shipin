/*
 * ========================================
 * REFUND MONEY MATH (SERVER-SAFE)
 * ========================================
 *
 * Pure calculations shared by the admin
 * and customer refund routes.
 *
 * No Firestore / no I/O — safe to unit
 * test and reuse from transactions.
 */

/**
 * Round to 2 decimal places (currency).
 */
export function roundMoney(value: number | undefined): number {
  return Number(
    (Number.isFinite(value ?? 0) ? value ?? 0 : 0).toFixed(2)
  );
}

export interface PaymentSources {
  walletAmount: number;
  paypalAmount: number;
}

export interface RefundSplit {
  walletRefund: number;
  paypalRefund: number;
  /**
   * True when the refund can no longer be
   * covered by the original payment sources.
   */
  exceedsOriginalSources: boolean;
}

/*
 * ========================================
 * REFUND SPLIT
 * ========================================
 *
 * Refunds are covered by the original
 * payment sources in order:
 *
 *   1. wallet portion first
 *   2. then the PayPal portion
 *
 * Used by:
 * - admin partial-refund complete
 *   (pre-check + in-transaction check)
 */
export function computeRefundSplit(
  amount: number,
  payment: PaymentSources | undefined | null
): RefundSplit {
  const walletAmount = roundMoney(
    Number(payment?.walletAmount ?? 0)
  );

  const paypalAmount = roundMoney(
    Number(payment?.paypalAmount ?? 0)
  );

  const roundedAmount = roundMoney(amount);

  const walletRefund =
    Math.min(
      roundedAmount,
      Math.max(0, walletAmount)
    );

  const paypalRefund = roundMoney(
    roundedAmount - walletRefund
  );

  const exceedsOriginalSources =
    paypalRefund > paypalAmount + 0.01;

  return {
    walletRefund,
    paypalRefund,
    exceedsOriginalSources,
  };
}

/*
 * ========================================
 * REMAINING REFUNDABLE
 * ========================================
 *
 * totalPaid - totalRefundedAmount, in
 * cents-precise currency.
 *
 * Used by:
 * - admin partial-refund (offer creation)
 * - customer partial-refund flows
 */
export function remainingRefundable(
  totalPaid: number,
  totalRefunded: number
): number {
  return roundMoney(
    roundMoney(totalPaid) - roundMoney(totalRefunded)
  );
}

/*
 * ========================================
 * NEW WALLET BALANCE AFTER CREDIT
 * ========================================
 */
export function walletBalanceAfterCredit(
  currentBalance: number,
  creditAmount: number
): number {
  return roundMoney(
    roundMoney(currentBalance) + roundMoney(creditAmount)
  );
}
