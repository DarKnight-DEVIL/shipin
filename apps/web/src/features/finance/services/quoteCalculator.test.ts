import { describe, it, expect } from "vitest";
import {
  calculateServiceFee,
  requiresManualQuote,
  calculateInspectionFee,
  calculateHoldFee,
} from "@/features/finance/services/calculateServiceFee";

describe("quoteCalculator", () => {
  describe("calculateServiceFee", () => {
    it("returns 0 for products total <= $10", () => {
      expect(calculateServiceFee(10).fee).toBe(0);
      expect(calculateServiceFee(5).fee).toBe(0);
      expect(calculateServiceFee(0).fee).toBe(0);
    });

    it("returns $5 for products total > $10 and <= $30", () => {
      expect(calculateServiceFee(15).fee).toBe(5);
      expect(calculateServiceFee(25).fee).toBe(5);
      expect(calculateServiceFee(30).fee).toBe(5);
    });

    it("returns 10% (min $10) for products total > $30 and <= $500", () => {
      expect(calculateServiceFee(31).fee).toBe(10); // min $10
      expect(calculateServiceFee(100).fee).toBe(10);
      expect(calculateServiceFee(200).fee).toBe(20); // 10%
      expect(calculateServiceFee(500).fee).toBe(50);
    });

    it("returns 0 for products total > $500 (manual quote)", () => {
      expect(calculateServiceFee(501).fee).toBe(0);
      expect(calculateServiceFee(1000).fee).toBe(0);
    });

    it("handles invalid input gracefully", () => {
      expect(calculateServiceFee(NaN).fee).toBe(0);
      expect(calculateServiceFee(-10).fee).toBe(0);
      expect(calculateServiceFee(Infinity).fee).toBe(0);
    });
  });

  describe("requiresManualQuote", () => {
    it("returns true for products total > $500", () => {
      expect(requiresManualQuote(501)).toBe(true);
      expect(requiresManualQuote(1000)).toBe(true);
    });

    it("returns false for products total <= $500", () => {
      expect(requiresManualQuote(500)).toBe(false);
      expect(requiresManualQuote(30)).toBe(false);
      expect(requiresManualQuote(0)).toBe(false);
    });

    it("handles invalid input", () => {
      expect(requiresManualQuote(NaN)).toBe(false);
      expect(requiresManualQuote(-10)).toBe(false);
      expect(requiresManualQuote(Infinity)).toBe(false); // Infinity is not finite
    });
  });

  describe("calculateInspectionFee", () => {
    it("returns $5 for detailed inspection", () => {
      expect(
        calculateInspectionFee({
          inspection: "detailed",
          shippingPreference: "approval",
        })
      ).toBe(5);
    });

    it("returns 0 for standard inspection", () => {
      expect(
        calculateInspectionFee({
          inspection: "standard",
          shippingPreference: "approval",
        })
      ).toBe(0);
    });

    it("returns 0 for no inspection", () => {
      expect(
        calculateInspectionFee({
          inspection: "none",
          shippingPreference: "approval",
        })
      ).toBe(0);
    });

    it("returns 0 when services is undefined", () => {
      expect(calculateInspectionFee(undefined)).toBe(0);
    });
  });

  describe("calculateHoldFee", () => {
    it("returns $5 for hold shipping preference", () => {
      expect(
        calculateHoldFee({ inspection: "standard", shippingPreference: "hold" })
      ).toBe(5);
    });

    it("returns 0 for auto shipping preference", () => {
      expect(
        calculateHoldFee({ inspection: "standard", shippingPreference: "auto" })
      ).toBe(0);
    });

    it("returns 0 for approval shipping preference", () => {
      expect(
        calculateHoldFee({
          inspection: "standard",
          shippingPreference: "approval",
        })
      ).toBe(0);
    });

    it("returns 0 when services is undefined", () => {
      expect(calculateHoldFee(undefined)).toBe(0);
    });
  });
});
