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

  /*
   * Round UP, never to nearest: rounding down would leave the fee one cent
   * short of the amount ShipIN has to net, and the customer would silently
   * absorb the difference. The epsilon strips binary-float noise so an exact
   * cent (103.30 * 100 = 10330.000000000002) does not become 103.31.
   */
  const cents = Math.ceil(Math.round(total * 100 * 1e6) / 1e6);
  const totalToCharge = cents / 100;

  return {
    fee: Number((totalToCharge - amount).toFixed(2)),
    totalToCharge,
  };
}