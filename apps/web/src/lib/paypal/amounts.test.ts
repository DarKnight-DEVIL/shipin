import { describe, it, expect } from "vitest";

import { roundMoney, sameCents, toNumber } from "./amounts";

describe("toNumber", () => {
  it("passes a finite number through", () => {
    expect(toNumber(84.7)).toBe(84.7);
  });

  it("reads a numeric string, as older Firestore rows store amounts", () => {
    expect(toNumber("12.50")).toBe(12.5);
  });

  it("reads anything unusable as zero", () => {
    expect(toNumber(undefined)).toBe(0);
    expect(toNumber(null)).toBe(0);
    expect(toNumber("")).toBe(0);
    expect(toNumber("not a number")).toBe(0);
    expect(toNumber(Number.NaN)).toBe(0);
    expect(toNumber(Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe("roundMoney", () => {
  it("rounds a float tail away", () => {
    expect(roundMoney(84.69999999999999)).toBe(84.7);
    expect(roundMoney(0.1 + 0.2)).toBe(0.3);
  });

  it("leaves an exact amount alone", () => {
    expect(roundMoney(104.7)).toBe(104.7);
  });
});

describe("sameCents", () => {
  it("treats a float tail as the same amount", () => {
    expect(sameCents(84.69999999999999, 84.7)).toBe(true);
    expect(sameCents(0.1 + 0.2, 0.3)).toBe(true);
  });

  it("treats one cent as a different amount", () => {
    expect(sameCents(100.01, 100)).toBe(false);
    expect(sameCents(100, 99.99)).toBe(false);
  });
});
