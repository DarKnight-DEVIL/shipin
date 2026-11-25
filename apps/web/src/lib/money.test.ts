/**
 * `money.ts` is the only module allowed to turn a decimal into a money amount
 * or back. Its tests are therefore mostly about the cases that made the old
 * float representation dangerous: a third decimal, a value that came back from
 * JSON with a tail, a split that has to sum exactly.
 */

import { describe, expect, it } from "vitest";

import {
  allocateMinor,
  divideMinor,
  isMinor,
  MAX_MINOR,
  minorFromStored,
  minorPerUnit,
  negateMinor,
  parseMinor,
  scaleByRate,
  subtractMinor,
  sumMinor,
  toDecimal,
  toDecimalString,
  ZERO_MINOR,
} from "./money";

describe("parseMinor", () => {
  it("converts whole units and cents exactly", () => {
    expect(parseMinor(0)).toBe(0);
    expect(parseMinor(1)).toBe(100);
    expect(parseMinor(84.7)).toBe(8470);
    expect(parseMinor(0.01)).toBe(1);
    expect(parseMinor(-12.34)).toBe(-1234);
  });

  it("reads the decimal strings PayPal sends", () => {
    expect(parseMinor("84.70")).toBe(8470);
    expect(parseMinor("0.05")).toBe(5);
    expect(parseMinor("100")).toBe(10_000);
    expect(parseMinor("-3.5")).toBe(-350);
  });

  it("survives the float tails that JSON and Firestore add", () => {
    // 0.1 + 0.2, and the tail a stored 84.70 can come back with.
    expect(parseMinor(0.1 + 0.2)).toBe(30);
    expect(parseMinor(84.69999999999999)).toBe(8470);
    expect(parseMinor(103.30000000000001)).toBe(10_330);
  });

  it("rejects more precision than the currency has instead of rounding", () => {
    // The whole point: a caller passing three decimals has a bug, and rounding
    // it silently is how a customer gets charged a cent more than the quote.
    expect(() => parseMinor(84.703)).toThrow(/2 decimal place/);
    expect(() => parseMinor("84.703")).toThrow(/2 decimal place/);
    expect(() => parseMinor(0.001)).toThrow(/2 decimal place/);
  });

  it("rejects values that are not amounts at all", () => {
    expect(() => parseMinor(Number.NaN)).toThrow(/finite/);
    expect(() => parseMinor(Number.POSITIVE_INFINITY)).toThrow(/finite/);
    expect(() => parseMinor("84,70")).toThrow(/decimal/);
    expect(() => parseMinor("1e3")).toThrow(/decimal/);
    expect(() => parseMinor("")).toThrow(/decimal/);
    expect(() => parseMinor("about 84")).toThrow(/decimal/);
  });

  it("refuses amounts above the documented ceiling", () => {
    expect(parseMinor(9_999_999.99)).toBe(MAX_MINOR);
    expect(() => parseMinor(10_000_000)).toThrow(/range/);
    expect(() => parseMinor("10000001.00")).toThrow(/range/);
  });
});

describe("toDecimal and toDecimalString", () => {
  it("round-trips every cent without drift", () => {
    for (const amount of [0, 1, 5, 99, 100, 8470, MAX_MINOR, -8470]) {
      expect(parseMinor(toDecimal(amount))).toBe(amount);
    }
  });

  it("formats the way PayPal expects, with both decimals", () => {
    expect(toDecimalString(8470)).toBe("84.70");
    expect(toDecimalString(5)).toBe("0.05");
    expect(toDecimalString(10_000)).toBe("100.00");
    expect(toDecimalString(-8470)).toBe("-84.70");
    expect(toDecimalString(0)).toBe("0.00");
  });

  it("refuses a value that is not an integer number of minor units", () => {
    expect(() => toDecimal(84.7)).toThrow(/minor units/);
    expect(() => toDecimalString(1.5)).toThrow(/minor units/);
  });
});

describe("arithmetic", () => {
  it("adds the classic float-failure case exactly", () => {
    // 0.1 + 0.2 in dollars is 0.30000000000000004.
    expect(sumMinor(parseMinor(0.1), parseMinor(0.2))).toBe(30);
    expect(toDecimal(sumMinor(10, 20))).toBe(0.3);
  });

  it("sums a long ledger without accumulating error", () => {
    const cent = parseMinor(0.01);
    const thousandCents = Array.from({ length: 1000 }, () => cent);

    expect(sumMinor(...thousandCents)).toBe(1000);
    expect(toDecimal(sumMinor(...thousandCents))).toBe(10);
  });

  it("subtracts and negates exactly", () => {
    expect(subtractMinor(parseMinor(84.7), parseMinor(84.69))).toBe(1);
    expect(negateMinor(parseMinor(19.99))).toBe(-1999);
    expect(toDecimal(negateMinor(1999))).toBe(-19.99);
  });

  it("starts a sum at zero", () => {
    expect(sumMinor()).toBe(ZERO_MINOR);
  });

  it("refuses to mix a decimal into minor-unit arithmetic", () => {
    expect(() => sumMinor(100, 19.99)).toThrow(/minor units/);
    expect(() => subtractMinor(100, 0.5)).toThrow(/minor units/);
  });
});

describe("scaleByRate", () => {
  it("computes a percentage fee in minor units", () => {
    // 2.9% of $100.00 is $2.90.
    expect(scaleByRate(parseMinor(100), 0.029)).toBe(290);
  });

  it("rounds half up, the way PayPal does", () => {
    // 1.5% of $1.00 is exactly 1.5 cents; the customer pays the odd half cent.
    expect(scaleByRate(parseMinor(1), 0.015)).toBe(2);
    expect(scaleByRate(parseMinor(1), 0.0149)).toBe(1);
  });

  it("rounds a credit symmetrically to a debit", () => {
    expect(scaleByRate(parseMinor(-1), 0.015)).toBe(-2);
  });

  it("returns whole minor units for a zero rate", () => {
    expect(scaleByRate(parseMinor(84.7), 0)).toBe(0);
  });

  it("rejects a rate that is not a number", () => {
    expect(() => scaleByRate(100, Number.NaN)).toThrow(/rate/);
  });
});

describe("divideMinor", () => {
  it("grosses up by a rate, rounding half up", () => {
    // (10000 + 30) / (1 - 0.029) = 10329.55... → 10330
    expect(divideMinor(10_030, 1 - 0.029)).toBe(10_330);
    expect(divideMinor(10_030, 1 - 0.044)).toBe(10_492);
    expect(divideMinor(3382, 1 - 0.0349)).toBe(3504);
  });

  it("rounds a negative amount symmetrically", () => {
    expect(divideMinor(-10_030, 1 - 0.029)).toBe(-10_330);
  });

  it("rejects a divisor it cannot use", () => {
    expect(() => divideMinor(100, 0)).toThrow(/divisor/);
    expect(() => divideMinor(100, Number.NaN)).toThrow(/divisor/);
  });
});

describe("allocateMinor", () => {
  it("splits so the parts sum to the whole", () => {
    const parts = allocateMinor(parseMinor(100), [1, 1, 1]);

    expect(parts).toEqual([3334, 3333, 3333]);
    expect(sumMinor(...parts)).toBe(10_000);
  });

  it("respects uneven weights and still sums exactly", () => {
    const parts = allocateMinor(parseMinor(100), [3, 1]);

    expect(sumMinor(...parts)).toBe(10_000);
    expect(parts[0]).toBeGreaterThan(parts[1]);
  });

  it("gives a single weight the whole amount", () => {
    expect(allocateMinor(parseMinor(84.7), [1])).toEqual([8470]);
  });

  it("handles a zero weight without losing the total", () => {
    const parts = allocateMinor(parseMinor(50), [1, 0]);

    expect(parts).toEqual([5000, 0]);
  });

  it("allocates a negative total symmetrically", () => {
    const parts = allocateMinor(parseMinor(-100), [1, 1, 1]);

    expect(sumMinor(...parts)).toBe(-10_000);
    expect(parts).toEqual([-3334, -3333, -3333]);
  });

  it("breaks ties by index so the result is deterministic", () => {
    expect(allocateMinor(3, [1, 1])).toEqual([2, 1]);
    expect(allocateMinor(3, [1, 1])).toEqual(allocateMinor(3, [1, 1]));
  });

  it("rejects weights it cannot allocate across", () => {
    expect(() => allocateMinor(100, [])).toThrow(/zero weights/);
    expect(() => allocateMinor(100, [0, 0])).toThrow(/zero total weight/);
    expect(() => allocateMinor(100, [1, -1])).toThrow(/non-negative/);
    expect(() => allocateMinor(100, [1, Number.NaN])).toThrow(/finite/);
  });
});

describe("isMinor", () => {
  it("accepts integers in range and nothing else", () => {
    expect(isMinor(0)).toBe(true);
    expect(isMinor(-1)).toBe(true);
    expect(isMinor(MAX_MINOR)).toBe(true);

    expect(isMinor(1.5)).toBe(false);
    expect(isMinor(Number.NaN)).toBe(false);
    expect(isMinor(MAX_MINOR + 1)).toBe(false);
    expect(isMinor("100")).toBe(false);
    expect(isMinor(null)).toBe(false);
  });
});

describe("minorFromStored", () => {
  it("reads a decimal written before the migration", () => {
    expect(minorFromStored(84.7)).toBe(8470);
    expect(minorFromStored(0)).toBe(0);
    expect(minorFromStored(103.30000000000001)).toBe(10_330);
  });

  it("tolerates the float tail a JSON round-trip leaves behind", () => {
    // A stored 84.70 that came back with noise must not become 8471, and must
    // not throw where a user is opening a wallet.
    expect(minorFromStored(84.69999999999999)).toBe(8470);
    expect(minorFromStored(0.06999999999999999)).toBe(7);
  });

  it("treats a missing or unusable value as no money", () => {
    expect(minorFromStored(undefined)).toBe(0);
    expect(minorFromStored(null)).toBe(0);
    expect(minorFromStored("")).toBe(0);
    expect(minorFromStored(Number.NaN)).toBe(0);
    expect(minorFromStored({ amount: 1 })).toBe(0);
    expect(minorFromStored("not money")).toBe(0);
  });

  it("reads a numeric string as a decimal amount", () => {
    expect(minorFromStored("84.70")).toBe(8470);
    expect(minorFromStored("12")).toBe(1200);
  });
});

describe("currency precision", () => {
  it("states the minor unit for the currency rather than assuming two", () => {
    expect(minorPerUnit("USD")).toBe(100);
  });
});
