import type { QuoteBreakdown } from "@/types/request";
import { calculateProcessingFee } from "./calculateProcessingFee";
import { calculateWalletUsage } from "./wallet";

export interface PaymentCalculation {
  subtotal: number;
  domesticShipping: number;
  internationalShipping: number;
  serviceFee: number;
  inspectionFee: number;
  holdFee: number;

  walletApplied: number;
  processingFee: number;

  paypalAmount: number;
  totalPaid: number;
  grandTotal: number;
  breakdown: QuoteBreakdown;
}

interface Params {
  breakdown: QuoteBreakdown;

  walletBalance: number;

  useWallet: boolean;
}

export function calculatePayment({
  breakdown,
  walletBalance,
  useWallet,
}: Params): PaymentCalculation {
  const processing = calculateProcessingFee({
    amount: breakdown.grandTotal,
    percentage: 0.044,
    fixedFee: 0.30,
    absorbFee: false,
  });

  const baseTotal = processing.totalToCharge;

  const wallet = calculateWalletUsage({
    balance: walletBalance,
    orderTotal: baseTotal,
    enabled: useWallet,
  });

  const totalPaid = wallet.applied + wallet.remaining;

  return {
    subtotal: breakdown.productsTotal,

    domesticShipping: breakdown.domesticShipping,

    internationalShipping: breakdown.internationalShipping,

    serviceFee: breakdown.serviceFee,

    inspectionFee: breakdown.inspectionFee ?? 0,

    holdFee: breakdown.holdFee ?? 0,

    walletApplied: wallet.applied,

    processingFee: processing.fee,

    paypalAmount: wallet.remaining,

    totalPaid,

    grandTotal: baseTotal,

    breakdown,
  };
}