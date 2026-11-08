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

  const total =
    (amount + fixedFee) /
    (1 - percentage);

  const fee = total - amount;

  return {
    fee: Number(fee.toFixed(2)),
    totalToCharge: Number(total.toFixed(2)),
  };
}