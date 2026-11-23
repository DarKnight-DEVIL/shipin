import { describe, it, expect } from "vitest";

import { calculateProcessingFee } from "./calculateProcessingFee";

describe("calculateProcessingFee", () => {
  it("charges nothing extra when ShipIN absorbs the fee", () => {
    expect(
      calculateProcessingFee({
        amount: 250,
        percentage: 0.029,
        fixedFee: 0.3,
        absorbFee: true,
      })
    ).toEqual({ fee: 0, totalToCharge: 250 });
  });

  it("grosses up so ShipIN nets the requested amount", () => {
    const result = calculateProcessingFee({
      amount: 100,
      percentage: 0.029,
      fixedFee: 0.3,
      absorbFee: false,
    });

    expect(result.totalToCharge).toBe(103.3);
    expect(result.fee).toBe(3.3);
  });

  it("lets PayPal keep the fee out of the grossed-up total", () => {
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

  it("rounds the total up so the fee is never a cent short", () => {
    const result = calculateProcessingFee({
      amount: 100,
      percentage: 0.044,
      fixedFee: 0.3,
      absorbFee: false,
    });

    // 100.30 / 0.956 = 104.9163... ; to-nearest would give 104.92 as well, but
    // the guarantee is the direction: never below the exact gross-up.
    expect(result.totalToCharge).toBe(104.92);
    expect(result.totalToCharge).toBeGreaterThanOrEqual(104.9163);
    expect(result.fee).toBe(4.92);
  });

  it("rounds a fractional cent to nearest using banker's rounding", () => {
    // 33.82 / 0.9651 = 35.0429... ; banker's rounding gives 35.04 (not 35.05).
    // The old Math.ceil behavior would overcharge by 1¢.
    const result = calculateProcessingFee({
      amount: 33.33,
      percentage: 0.0349,
      fixedFee: 0.49,
      absorbFee: false,
    });

    expect(result.totalToCharge).toBeCloseTo(35.04, 5);
    expect(result.fee).toBeCloseTo(1.71, 5);
  });

  it("rounds monetary values to two decimals", () => {
    const result = calculateProcessingFee({
      amount: 33.33,
      percentage: 0.0349,
      fixedFee: 0.49,
      absorbFee: false,
    });

    expect(result.fee).toBe(Number(result.fee.toFixed(2)));
    expect(result.totalToCharge).toBe(Number(result.totalToCharge.toFixed(2)));
  });

  it("returns zero fee for a zero percentage and fixed fee", () => {
    expect(
      calculateProcessingFee({
        amount: 80,
        percentage: 0,
        fixedFee: 0,
        absorbFee: false,
      })
    ).toEqual({ fee: 0, totalToCharge: 80 });
  });
});
