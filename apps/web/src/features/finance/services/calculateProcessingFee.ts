import {
  divideMinor,
  minorFromStored,
  toDecimal,
  type Minor,
} from "@/lib/money";

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
const MAX_PROCESSING_FEE_MINOR: Minor = 10_000;

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
  /*
   * Everything below is integer cents (ADR-0008). The decimal forms come in
   * from Firestore and config, get converted once, and the gross-up happens on
   * integers so the result cannot carry a float tail into a charge.
   */
  const amountMinor = minorFromStored(amount);

  if (absorbFee) {
    return {
      fee: 0,
      totalToCharge: toDecimal(amountMinor),
    };
  }

  const fixedFeeMinor = minorFromStored(fixedFee);

  /* Reverse PayPal fee calculation: total x (1 - percentage) = amount + fixed */
  let totalMinor = divideMinor(amountMinor + fixedFeeMinor, 1 - percentage);

  /*
   * One rounding, half-up, on the grossed-up total. If the rounded total leaves
   * the fee fractionally short, ShipIN absorbs the sub-cent difference rather
   * than passing it to the customer.
   */
  const uncappedFeeMinor = totalMinor - amountMinor;

  if (uncappedFeeMinor > MAX_PROCESSING_FEE_MINOR) {
    totalMinor = amountMinor + MAX_PROCESSING_FEE_MINOR;
  }

  return {
    fee: toDecimal(totalMinor - amountMinor),
    totalToCharge: toDecimal(totalMinor),
  };
}
