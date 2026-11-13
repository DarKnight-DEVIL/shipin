import { describe, it, expect } from 'vitest';

import { calculateProcessingFee } from './calculateProcessingFee';

describe('calculateProcessingFee', () => {
  it('charges nothing extra when ShipIN absorbs the fee', () => {
    expect(
      calculateProcessingFee({ amount: 250, percentage: 0.029, fixedFee: 0.3, absorbFee: true })
    ).toEqual({ fee: 0, totalToCharge: 250 });
  });

  it('grosses up so ShipIN nets the requested amount', () => {
    const result = calculateProcessingFee({
      amount: 100,
      percentage: 0.029,
      fixedFee: 0.3,
      absorbFee: false,
    });

    expect(result.totalToCharge).toBe(103.3);
    expect(result.fee).toBe(3.3);
  });

  it('lets PayPal keep the fee out of the grossed-up total', () => {
    const { totalToCharge, fee } = calculateProcessingFee({
      amount: 100,
      percentage: 0.029,
      fixedFee: 0.3,
      absorbFee: false,
    });

    const paypalCut = totalToCharge * 0.029 + 0.3;

    expect(Number((totalToCharge - paypalCut).toFixed(2))).toBeCloseTo(100, 1);
    expect(fee).toBeCloseTo(totalToCharge - 100, 5);
  });

  it('rounds monetary values to two decimals', () => {
    const result = calculateProcessingFee({
      amount: 33.33,
      percentage: 0.0349,
      fixedFee: 0.49,
      absorbFee: false,
    });

    expect(result.fee).toBe(Number(result.fee.toFixed(2)));
    expect(result.totalToCharge).toBe(Number(result.totalToCharge.toFixed(2)));
  });

  it('returns zero fee for a zero percentage and fixed fee', () => {
    expect(
      calculateProcessingFee({ amount: 80, percentage: 0, fixedFee: 0, absorbFee: false })
    ).toEqual({ fee: 0, totalToCharge: 80 });
  });
});
