export interface PaymentResult {
  subtotal: number;
  domesticShipping: number;
  internationalShipping: number;
  serviceFee: number;
  inspectionFee: number;
  holdFee: number;
  processingFee: number;
  walletApplied: number;
  paypalAmount: number;
  totalPaid: number;
  grandTotal: number;
}