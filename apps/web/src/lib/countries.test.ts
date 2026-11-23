import { describe, it, expect } from "vitest";

import { COUNTRIES } from "./countries";

describe("COUNTRIES", () => {
  it("covers the ISO 3166-1 countries an address can hold", () => {
    const codes = COUNTRIES.map((country) => country.value);

    // Spot checks across every continent, plus the codes the old dataset was
    // used for. A drop in the label import would show up here, not in a form
    // that silently offers fewer destinations.
    for (const code of ["US", "GB", "DE", "FR", "IN", "JP", "BR", "NG", "AU"]) {
      expect(codes).toContain(code);
    }
    expect(COUNTRIES.length).toBeGreaterThanOrEqual(249);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("offers only real destinations", () => {
    const codes = COUNTRIES.map((country) => country.value);

    // `XA`/`XO` are libphonenumber's localisation-testing pseudo-regions and
    // `ZZ` is "unknown"; the locale object's own string keys are not countries
    // either. None of them can receive a parcel.
    for (const code of ["XA", "XO", "ZZ", "ext", "country", "phone"]) {
      expect(codes).not.toContain(code);
    }
  });

  it("names its entries and sorts them for the select", () => {
    const byName = [...COUNTRIES].sort((a, b) => a.name.localeCompare(b.name));

    expect(COUNTRIES.map((country) => country.value)).toEqual(
      byName.map((country) => country.value)
    );
    expect(COUNTRIES.find((country) => country.value === "US")?.name).toBe(
      "United States"
    );
  });

  it("derives a flag from the ISO code instead of shipping images", () => {
    const us = COUNTRIES.find((country) => country.value === "US");

    // 🇺🇸 = U+1F1FA U+1F1F8 (regional indicator symbols), two code points.
    expect(us?.label).toBe("\u{1F1FA}\u{1F1F8}  United States");
    expect([...(us?.label ?? "")].length).toBe("  United States".length + 2);
  });
});
