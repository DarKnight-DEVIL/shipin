import { describe, it, expect } from 'vitest';
import {
  roundMoney,
  computeRefundSplit,
  remainingRefundable,
  walletBalanceAfterCredit,
} from '@/features/finance/services/refundMath';

describe('roundMoney', () => {
  it('rounds to 2 decimal places', () => {
    // toFixed(2) rounds half-up in JavaScript
    expect(roundMoney(10.005)).toBe(10.01);
    expect(roundMoney(10.004)).toBe(10.0);
    expect(roundMoney(0)).toBe(0);
    // -5.555 rounds to -5.55 via toFixed(2), not -5.56
    expect(roundMoney(-5.555)).toBe(-5.55);
    expect(roundMoney(NaN)).toBe(0);
    expect(roundMoney(undefined)).toBe(0);
  });

  it('handles finite numbers correctly', () => {
    expect(roundMoney(123.456)).toBe(123.46);
    expect(roundMoney(99.999)).toBe(100);
    expect(roundMoney(0.1 + 0.2)).toBe(0.3); // floating point concern
  });
});

describe('computeRefundSplit', () => {
  it('splits refund between wallet and PayPal when both have sufficient funds', () => {
    const payment = { walletAmount: 50, paypalAmount: 50 };
    const result = computeRefundSplit(75, payment);

    expect(result.walletRefund).toBe(50);
    expect(result.paypalRefund).toBe(25);
    expect(result.exceedsOriginalSources).toBe(false);
  });

  it('refunds wallet first, then PayPal', () => {
    const payment = { walletAmount: 30, paypalAmount: 100 };
    const result = computeRefundSplit(100, payment);

    expect(result.walletRefund).toBe(30);
    expect(result.paypalRefund).toBe(70);
    expect(result.exceedsOriginalSources).toBe(false);
  });

  it('handles refund exceeding wallet but within PayPal', () => {
    const payment = { walletAmount: 10, paypalAmount: 40 };
    const result = computeRefundSplit(25, payment);

    expect(result.walletRefund).toBe(10);
    expect(result.paypalRefund).toBe(15);
    expect(result.exceedsOriginalSources).toBe(false);
  });

  it('exceeds original sources when refund > wallet + paypal', () => {
    const payment = { walletAmount: 10, paypalAmount: 10 };
    const result = computeRefundSplit(50, payment);

    expect(result.walletRefund).toBe(10);
    expect(result.paypalRefund).toBe(40);
    expect(result.exceedsOriginalSources).toBe(true);
  });

  it('handles zero refund', () => {
    const payment = { walletAmount: 50, paypalAmount: 50 };
    const result = computeRefundSplit(0, payment);

    expect(result.walletRefund).toBe(0);
    expect(result.paypalRefund).toBe(0);
    expect(result.exceedsOriginalSources).toBe(false);
  });

  it('handles null/undefined payment sources', () => {
    const result = computeRefundSplit(50, null);
    expect(result.walletRefund).toBe(0);
    expect(result.paypalRefund).toBe(50);
    expect(result.exceedsOriginalSources).toBe(true);

    const result2 = computeRefundSplit(50, undefined);
    expect(result2.walletRefund).toBe(0);
    expect(result2.paypalRefund).toBe(50);
    expect(result2.exceedsOriginalSources).toBe(true);
  });

  it('handles payment with zero amounts', () => {
    const payment = { walletAmount: 0, paypalAmount: 0 };
    const result = computeRefundSplit(10, payment);

    expect(result.walletRefund).toBe(0);
    expect(result.paypalRefund).toBe(10);
    expect(result.exceedsOriginalSources).toBe(true);
  });
});

describe('remainingRefundable', () => {
  it('calculates remaining refundable amount', () => {
    expect(remainingRefundable(200, 50)).toBe(150);
    expect(remainingRefundable(100, 100)).toBe(0);
    expect(remainingRefundable(0, 0)).toBe(0);
  });

  it('handles floating point precision', () => {
    expect(remainingRefundable(100.005, 50.002)).toBeCloseTo(50, 2);
  });

  it('returns correct value when totalRefunded > totalPaid', () => {
    expect(remainingRefundable(50, 100)).toBe(-50);
  });
});

describe('walletBalanceAfterCredit', () => {
  it('adds credit amount to current balance', () => {
    expect(walletBalanceAfterCredit(100, 50)).toBe(150);
    expect(walletBalanceAfterCredit(0, 25)).toBe(25);
    expect(walletBalanceAfterCredit(500, 0)).toBe(500);
  });

  it('handles zero values', () => {
    expect(walletBalanceAfterCredit(0, 0)).toBe(0);
  });
});