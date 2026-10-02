import type { ServiceSelections } from "@/types/request";

/**
 * Calculates the ShipIN service fee based on the products total.
 *
 * Rules:
 * - Products total <= $10      → $0
 * - Products total > $10–$30   → $5
 * - Products total > $30–$500  → 10%, minimum $10
 * - Products total > $500      → Manual quote required
 *
 * Inspection and hold-package fees are intentionally NOT included here.
 * They are calculated separately in QuotePanel.
 */
export function calculateServiceFeeFromConfig(
  _services?: ServiceSelections,
  productsTotal: number = 0
): number {
  const total = Number(productsTotal);

  if (!Number.isFinite(total) || total <= 10) {
    return 0;
  }

  if (total <= 30) {
    return 5;
  }

  if (total <= 500) {
    return Math.max(total * 0.1, 10);
  }

  // Orders above $500 require a manual quote.
  return 0;
}

/**
 * Determines whether the products total requires a manual quote.
 */
export function requiresManualQuote(
  productsTotal: number
): boolean {
  const total = Number(productsTotal);

  return Number.isFinite(total) && total > 500;
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

  return services.inspection === "detailed" ? 5 : 0;
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

  return services.shippingPreference === "hold" ? 5 : 0;
}