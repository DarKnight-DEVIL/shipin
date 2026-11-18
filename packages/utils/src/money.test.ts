import { describe, expect, it } from "vitest";

import {
  addTax,
  calculatePercentage,
  formatCurrency,
  parseCurrency,
  roundToCents,
  subtractTax,
} from "./money";

describe("formatCurrency", () => {
  it("formats USD with two decimals by default", () => {
    expect(formatCurrency(1234.5)).toBe("$1,234.50");
    expect(formatCurrency(0)).toBe("$0.00");
  });

  it("honours an explicit currency and locale", () => {
    expect(formatCurrency(10, "EUR", "de-DE")).toBe("10,00\u00a0€");
  });

  it("keeps the sign on negative amounts", () => {
    expect(formatCurrency(-5)).toBe("-$5.00");
  });
});

describe("parseCurrency", () => {
  it("strips symbols and grouping so a formatted string round-trips", () => {
    expect(parseCurrency("$1,234.50")).toBe(1234.5);
    expect(parseCurrency("€ 42")).toBe(42);
  });

  it("returns 0 instead of NaN for values with no number in them", () => {
    expect(parseCurrency("")).toBe(0);
    expect(parseCurrency("n/a")).toBe(0);
  });
});

describe("roundToCents", () => {
  it("removes binary floating point noise", () => {
    expect(roundToCents(0.1 + 0.2)).toBe(0.3);
    expect(roundToCents(10.005)).toBe(10.01);
  });
});

describe("calculatePercentage", () => {
  it("returns a rounded percentage", () => {
    expect(calculatePercentage(1, 3)).toBe(33.33);
    expect(calculatePercentage(50, 200)).toBe(25);
  });

  it("returns 0 rather than Infinity when the total is zero", () => {
    expect(calculatePercentage(10, 0)).toBe(0);
  });
});

describe("addTax / subtractTax", () => {
  it("adds tax and rounds to cents", () => {
    expect(addTax(100, 8.25)).toBe(108.25);
  });

  it("removes tax so it inverts addTax", () => {
    expect(subtractTax(addTax(100, 8.25), 8.25)).toBe(100);
  });
});
