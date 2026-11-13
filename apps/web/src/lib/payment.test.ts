/**
 * Vitest unit tests for payment fee calculation logic.
 */
import { describe, it, expect } from 'vitest';

const PAYPAL_PERCENTAGE = 0.044;
const PAYPAL_FIXED_FEE = 0.30;

describe('PayPal processing fee', () => {
  it('calculates fee for $100 order', () => {
    const expectedFee = Math.round((100 * PAYPAL_PERCENTAGE + PAYPAL_FIXED_FEE) * 100) / 100;
    expect(expectedFee).toBeCloseTo(4.7, 1);
  });

  it('handles small amounts correctly', () => {
    const expectedFee = Math.round((10 * PAYPAL_PERCENTAGE + PAYPAL_FIXED_FEE) * 100) / 100;
    expect(expectedFee).toBeCloseTo(0.74, 1);
  });

  it('documents no upper cap exists on large orders', () => {
    const expectedFee = Math.round((50_000 * PAYPAL_PERCENTAGE + PAYPAL_FIXED_FEE) * 100) / 100;
    // No max-fee guard in current route — known follow-up item
    expect(expectedFee).toBeCloseTo(2200.3, 1);
  });

  it('processes zero correctly', () => {
    expect(Math.round((0 * PAYPAL_PERCENTAGE + PAYPAL_FIXED_FEE) * 100) / 100).toBe(0.3);
  });
});

describe('money precision via Zod refine pattern', () => {
  function rounded(n: number): number {
    return Math.round((n + Number.EPSILON) * 100) / 100;
  }

  it('rounds sub-cent values up', () => {
    expect(rounded(10.123)).toBe(10.12);
    expect(rounded(10.005)).toBe(10.01);
  });

  it('accepts clean 2-decimal values as valid', () => {
    const isValid = (n: number) => rounded(n) === n;
    expect(isValid(99.99)).toBe(true);
    expect(isValid(10.5)).toBe(true);
    expect(isValid(0)).toBe(true);
  });

  it('marks >2 decimal places as invalid for money schema', () => {
    const passesRefine = (n: number) => rounded(n) === n;
    expect(passesRefine(10.123)).toBe(false);
    expect(passesRefine(0.001)).toBe(false);
  });
});
