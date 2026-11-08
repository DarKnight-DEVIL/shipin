import { PRICING } from "@/config/pricing";
import type { ServiceSelections } from "@/types/request";

export interface ServiceFeeResult {
  fee: number;
  manualQuote: boolean;
  rule: string;
}

/**
 * Calculates the ShipIN service fee based on the products total.
 *
 * Rules:
 * - Products total <= $10      → $0
 * - Products total > $10–$30   → $5
 * - Products total > $30–$500  → 10%, minimum $10
 * - Products total > $500      → Manual quote required
 */
export function calculateServiceFee(
  productsTotal: number
): ServiceFeeResult {
  if (productsTotal <= PRICING.FREE_SERVICE_LIMIT) {
    return {
      fee: 0,
      manualQuote: false,
      rule: "Free Service",
    };
  }

  if (productsTotal <= PRICING.FLAT_FEE_LIMIT) {
    return {
      fee: PRICING.FLAT_FEE,
      manualQuote: false,
      rule: "Flat $5 Service Fee",
    };
  }

  if (productsTotal <= PRICING.PERCENTAGE_LIMIT) {
    return {
      fee: Math.max(
        productsTotal * PRICING.PERCENTAGE,
        PRICING.MIN_PERCENTAGE_FEE
      ),
      manualQuote: false,
      rule: "10% Service Fee",
    };
  }

  return {
    fee: 0,
    manualQuote: true,
    rule: "Manual Quote Required",
  };
}

/**
 * Determines whether the products total requires a manual quote.
 */
export function requiresManualQuote(productsTotal: number): boolean {
  const total = Number(productsTotal);
  return Number.isFinite(total) && total > PRICING.PERCENTAGE_LIMIT;
}

/**
 * Calculates the detailed inspection fee.
 */
export function calculateInspectionFee(
  services?: ServiceSelections
): number {
  if (!services) {
    return 0;
  }
  return services.inspection === "detailed" ? PRICING.inspection.detailed.price : 0;
}

/**
 * Calculates the hold-package fee.
 */
export function calculateHoldFee(
  services?: ServiceSelections
): number {
  if (!services) {
    return 0;
  }
  return services.shippingPreference === "hold" ? PRICING.shipping.hold.price : 0;
}

/**
 * Calculates the ShipIN service fee based on the products total.
 * Returns just the numeric fee (for backward compatibility).
 *
 * @deprecated Use calculateServiceFee() instead for full result details.
 */
export function calculateServiceFeeFromConfig(
  _services?: ServiceSelections,
  productsTotal: number = 0
): number {
  return calculateServiceFee(productsTotal).fee;
}