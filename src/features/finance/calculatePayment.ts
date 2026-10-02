import type { QuoteBreakdown } from "@/types/request";
import { calculateProcessingFee } from "./calculateProcessingFee";
import { calculateWalletUsage } from "./wallet";

export interface PaymentCalculation {
  subtotal: number;
  domesticShipping: number;
  internationalShipping: number;

  // ShipIN service charges
  serviceFee: number;
  inspectionFee: number;
  holdFee: number;

  // PayPal / wallet
  walletApplied: number;
  processingFee: number;
  paypalAmount: number;

  // Final payment figures
  totalPaid: number;
  grandTotal: number;

  breakdown: QuoteBreakdown;
}

interface Params {
  breakdown: QuoteBreakdown;
  walletBalance: number;
  useWallet: boolean;
}

/**
 * Calculates the complete customer payment.
 *
 * Flow:
 *
 * Quote Grand Total
 *        ↓
 * PayPal processing fee
 *        ↓
 * Total amount required
 *        ↓
 * Wallet balance applied
 *        ↓
 * Remaining PayPal amount
 *
 * The ShipIN service fee is already included in
 * breakdown.grandTotal by the quotation system.
 */
export function calculatePayment({
  breakdown,
  walletBalance,
  useWallet,
}: Params): PaymentCalculation {
  /*
   * ========================================
   * VALIDATE QUOTE TOTAL
   * ========================================
   */

  const quoteGrandTotal = Number(
    breakdown.grandTotal
  );

  if (
    !Number.isFinite(quoteGrandTotal) ||
    quoteGrandTotal < 0
  ) {
    throw new Error(
      "Invalid quotation grand total."
    );
  }

  /*
   * ========================================
   * PAYPAL PROCESSING FEE
   * ========================================
   *
   * PayPal:
   * - 4.4%
   * - $0.30 fixed fee
   *
   * ShipIN does NOT absorb the PayPal fee.
   *
   * Therefore, if the quote is $100:
   *
   * Quote:
   * $100.00
   *
   * PayPal fee:
   * ~$4.92
   *
   * Customer total:
   * ~$104.92
   */

  const processing =
    calculateProcessingFee({
      amount: quoteGrandTotal,
      percentage: 0.044,
      fixedFee: 0.30,
      absorbFee: false,
    });

  const totalPaymentRequired =
    Number(
      processing.totalToCharge.toFixed(2)
    );

  const processingFee =
    Number(
      processing.fee.toFixed(2)
    );

  /*
   * ========================================
   * WALLET
   * ========================================
   *
   * Wallet is applied AFTER the PayPal
   * processing fee has been added.
   *
   * Example:
   *
   * Quote total:       $100.00
   * PayPal fee:          $4.92
   * Total required:    $104.92
   *
   * Wallet:            $100.00
   *
   * PayPal remaining:    $4.92
   */

  const wallet =
    calculateWalletUsage({
      balance: Math.max(
        0,
        Number(walletBalance) || 0
      ),

      orderTotal:
        totalPaymentRequired,

      enabled:
        useWallet,
    });

  const walletApplied =
    Number(
      wallet.applied.toFixed(2)
    );

  const paypalAmount =
    Number(
      wallet.remaining.toFixed(2)
    );

  /*
   * ========================================
   * TOTAL PAID
   * ========================================
   *
   * Wallet + PayPal must equal the complete
   * amount the customer is required to pay.
   */

  const totalPaid =
    Number(
      (
        walletApplied +
        paypalAmount
      ).toFixed(2)
    );

  /*
   * ========================================
   * RETURN
   * ========================================
   */

  return {
    /*
     * Original quotation breakdown
     */
    subtotal:
      Number(
        breakdown.productsTotal || 0
      ),

    domesticShipping:
      Number(
        breakdown.domesticShipping || 0
      ),

    internationalShipping:
      Number(
        breakdown.internationalShipping || 0
      ),

    /*
     * ShipIN fees
     *
     * These come from the quote.
     * They are NOT PayPal processing fees.
     */
    serviceFee:
      Number(
        breakdown.serviceFee || 0
      ),

    inspectionFee:
      Number(
        breakdown.inspectionFee || 0
      ),

    holdFee:
      Number(
        breakdown.holdFee || 0
      ),

    /*
     * Wallet
     */
    walletApplied,

    /*
     * PayPal processing fee
     */
    processingFee,

    /*
     * Amount PayPal actually needs to collect
     */
    paypalAmount,

    /*
     * Complete customer payment:
     * Wallet + PayPal
     */
    totalPaid,

    /*
     * IMPORTANT:
     *
     * grandTotal here represents the complete
     * amount INCLUDING the PayPal processing fee.
     *
     * The original ShipIN quotation grand total
     * remains available through `breakdown.grandTotal`.
     */
    grandTotal:
      totalPaymentRequired,

    breakdown,
  };
}