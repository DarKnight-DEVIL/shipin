import { describe, it, expect } from 'vitest';

import { validatePaymentAmount } from './payment';

describe('validatePaymentAmount', () => {
  it('accepts an exact match', () => {
    expect(validatePaymentAmount(120, 120)).toBe(true);
  });

  it('tolerates one cent for floating point rounding', () => {
    expect(validatePaymentAmount(120, 120.01)).toBe(true);
    expect(validatePaymentAmount(120, 119.99)).toBe(true);
  });

  it('rejects anything beyond one cent', () => {
    expect(() => validatePaymentAmount(120, 120.02)).toThrow(
      'Payment mismatch. Expected 120, received 120.02'
    );
    expect(() => validatePaymentAmount(120, 119.98)).toThrow(
      'Payment mismatch. Expected 120, received 119.98'
    );
  });

  it('rejects a zero payment for a non-zero expectation', () => {
    expect(() => validatePaymentAmount(50, 0)).toThrow('Payment mismatch.');
  });
});
