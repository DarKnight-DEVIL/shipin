import { PRICING } from "@/constants/pricing";

export interface ServiceFeeResult {
  fee: number;
  manualQuote: boolean;
  rule: string;
}

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