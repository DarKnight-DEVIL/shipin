import { describe, it, expect } from 'vitest';

import { calculateWalletUsage } from './wallet';

describe('calculateWalletUsage', () => {
  it('applies nothing when the wallet is disabled', () => {
    expect(calculateWalletUsage({ balance: 100, orderTotal: 40, enabled: false })).toEqual({
      available: 100,
      applied: 0,
      remaining: 40,
    });
  });

  it('applies the full balance when it covers the order', () => {
    expect(calculateWalletUsage({ balance: 100, orderTotal: 40, enabled: true })).toEqual({
      available: 100,
      applied: 40,
      remaining: 0,
    });
  });

  it('applies a partial balance', () => {
    expect(calculateWalletUsage({ balance: 25, orderTotal: 40, enabled: true })).toEqual({
      available: 25,
      applied: 25,
      remaining: 15,
    });
  });

  it('never reports a negative remainder', () => {
    const usage = calculateWalletUsage({ balance: 0, orderTotal: 0, enabled: true });

    expect(usage).toEqual({ available: 0, applied: 0, remaining: 0 });
  });
});
