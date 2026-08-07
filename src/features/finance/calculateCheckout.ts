import { CheckoutCost } from "../checkout/types/checkout";

export function calculateCheckout(
  subtotal: number,
  shipping: number,
  insurance: number,
  taxes: number,
  serviceFee: number,
  additionalServices: number,
  walletApplied: number = 0,
  processingFee: number = 0
): CheckoutCost {
  const total =
    subtotal +
    shipping +
    insurance +
    taxes +
    serviceFee +
    additionalServices +
    processingFee -
    walletApplied;

  return {
    subtotal,
    shipping,
    insurance,
    taxes,
    serviceFee,
    additionalServices,
    walletApplied,
    processingFee,
    total,
  };
}