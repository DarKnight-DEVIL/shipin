export interface ProcessingFeeResult {
  fee: number;
  totalToCharge: number;
}

interface Params {
  amount: number;
  percentage: number;
  fixedFee: number;
  absorbFee: boolean;
}

/** Maximum processing fee that can be charged (USD). Prevents runaway fees on large orders. */
const MAX_PROCESSING_FEE = 100;

/**
 * If absorbFee=true:
 * Customer pays exactly amount.
 * ShipIN absorbs the gateway fee.
 *
 * If absorbFee=false:
 * Customer pays enough so ShipIN receives amount.
 */
export function calculateProcessingFee({
  amount,
  percentage,
  fixedFee,
  absorbFee,
}: Params): ProcessingFeeResult {
  if (absorbFee) {
    return {
      fee: 0,
      totalToCharge: amount,
    };
  }

  /*
   * Reverse PayPal fee calculation
   */

  const total = (amount + fixedFee) / (1 - percentage);

  /*
   * Round to nearest cent using banker's rounding (Math.round with epsilon).
   * This ensures the customer pays exactly the calculated amount without
   * systematic overcharging. The epsilon strips binary-float noise so an
   * exact cent (103.30 * 100 = 10330.000000000002) does not become 103.31.
   *
   * If the rounded total leaves the fee fractionally short, ShipIN absorbs
   * the sub-cent difference rather than passing it to the customer.
   */
  let totalToCharge = Math.round((total + Number.EPSILON) * 100) / 100;

  // Cap the processing fee at MAX_PROCESSING_FEE
  const uncappedFee = totalToCharge - amount;
  if (uncappedFee > MAX_PROCESSING_FEE) {
    totalToCharge = amount + MAX_PROCESSING_FEE;
  }

  return {
    fee: Number((totalToCharge - amount).toFixed(2)),
    totalToCharge,
  };
}
