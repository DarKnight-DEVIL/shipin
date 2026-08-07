export interface PaymentPlan {
  walletAmount: number;
  paypalAmount: number;
  total: number;
  walletOnly: boolean;
}

export function createPaymentPlan(
  walletApplied: number,
  paypalAmount: number
): PaymentPlan {
  return {
    walletAmount: walletApplied,
    paypalAmount,
    total: walletApplied + paypalAmount,
    walletOnly: paypalAmount === 0,
  };
}