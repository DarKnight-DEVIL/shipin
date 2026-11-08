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
  const difference = Math.abs(expected - received);

  if (difference > 0.01) {
    throw new PaymentError(
      `Payment mismatch. Expected ${expected}, received ${received}`
    );
  }

  return true;
}