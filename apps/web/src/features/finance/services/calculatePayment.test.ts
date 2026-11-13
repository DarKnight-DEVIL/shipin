/**
 * Tests for the customer payment calculation.
 *
 * Uses the real processing-fee and wallet helpers so the assertions describe
 * the money a customer actually pays, not mock interactions.
 */

import { describe, it, expect } from 'vitest';

import { calculatePayment } from './calculatePayment';
import type { QuoteBreakdown } from '@/types/request';

const breakdown = {
  productsTotal: 80,
  domesticShipping: 5,
  internationalShipping: 10,
  serviceFee: 3,
  inspectionFee: 1,
  holdFee: 1,
  grandTotal: 100,
} as QuoteBreakdown;

const payment = (overrides: Partial<Parameters<typeof calculatePayment>[0]> = {}) =>
  calculatePayment({ breakdown, walletBalance: 0, useWallet: false, ...overrides });

describe('calculatePayment — quote validation', () => {
  it('rejects a non-numeric grand total', () => {
    expect(() =>
      payment({ breakdown: { ...breakdown, grandTotal: 'lots' } as never })
    ).toThrow('Invalid quotation grand total.');
  });

  it('rejects NaN', () => {
    expect(() =>
      payment({ breakdown: { ...breakdown, grandTotal: Number.NaN } as never })
    ).toThrow('Invalid quotation grand total.');
  });

  it('rejects a negative grand total', () => {
    expect(() =>
      payment({ breakdown: { ...breakdown, grandTotal: -1 } as never })
    ).toThrow('Invalid quotation grand total.');
  });
});

describe('calculatePayment — PayPal processing fee', () => {
  it('grosses up a $100 quote to cover the 4.4% + $0.30 fee', () => {
    const result = payment();

    expect(result.grandTotal).toBe(104.92);
    expect(result.processingFee).toBe(4.92);
    expect(result.paypalAmount).toBe(104.92);
    expect(result.totalPaid).toBe(104.92);
  });

  it('leaves the original quote total available on the breakdown', () => {
    expect(payment().breakdown.grandTotal).toBe(100);
  });

  it('keeps wallet + PayPal equal to the required total', () => {
    const result = payment({ walletBalance: 100, useWallet: true });

    expect(result.walletApplied + result.paypalAmount).toBeCloseTo(result.grandTotal, 2);
    expect(result.totalPaid).toBe(result.grandTotal);
  });
});

describe('calculatePayment — wallet', () => {
  it('applies nothing when the wallet is off', () => {
    const result = payment({ walletBalance: 500, useWallet: false });

    expect(result.walletApplied).toBe(0);
    expect(result.paypalAmount).toBe(104.92);
  });

  it('splits the payment when the balance is partial', () => {
    const result = payment({ walletBalance: 50, useWallet: true });

    expect(result.walletApplied).toBe(50);
    expect(result.paypalAmount).toBe(54.92);
    expect(result.totalPaid).toBe(104.92);
  });

  it('covers the whole payment when the balance is sufficient', () => {
    const result = payment({ walletBalance: 500, useWallet: true });

    expect(result.walletApplied).toBe(104.92);
    expect(result.paypalAmount).toBe(0);
    expect(result.totalPaid).toBe(104.92);
  });

  it('clamps a negative or unusable balance to zero', () => {
    const negative = payment({ walletBalance: -20, useWallet: true });
    const invalid = payment({ walletBalance: Number.NaN, useWallet: true });

    expect(negative.walletApplied).toBe(0);
    expect(invalid.walletApplied).toBe(0);
    expect(negative.paypalAmount).toBe(104.92);
  });
});

describe('calculatePayment — breakdown projection', () => {
  it('carries the quote line items through', () => {
    expect(payment()).toMatchObject({
      subtotal: 80,
      domesticShipping: 5,
      internationalShipping: 10,
      serviceFee: 3,
      inspectionFee: 1,
      holdFee: 1,
    });
  });

  it('defaults missing line items to zero', () => {
    const result = payment({
      breakdown: { grandTotal: 10 } as QuoteBreakdown,
    });

    expect(result).toMatchObject({
      subtotal: 0,
      domesticShipping: 0,
      internationalShipping: 0,
      serviceFee: 0,
      inspectionFee: 0,
      holdFee: 0,
    });
  });
});
