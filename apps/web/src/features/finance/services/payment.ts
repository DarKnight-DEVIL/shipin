import { PaymentError } from '@/utils/errors';

/**
 * Validates that the received payment amount matches the expected amount
 * within a 1-cent tolerance for floating-point rounding.
 *
 * @throws {PaymentError} When the difference exceeds 0.01
 */
export function validatePaymentAmount(
  expected: number,
  received: number
): true {
  // Compare in whole cents: `Math.abs(120 - 119.99)` is 0.010000000000005,
  // which is above a raw 0.01 comparison and would reject a legitimate
  // one-cent shortfall.
  const differenceInCents = Math.round(Math.abs(expected - received) * 100);

  if (differenceInCents > 1) {
    throw new PaymentError(
      `Payment mismatch. Expected ${expected}, received ${received}`
    );
  }

  return true;
}