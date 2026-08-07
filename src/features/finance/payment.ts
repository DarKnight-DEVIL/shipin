export function validatePaymentAmount(
  expected: number,
  received: number
) {
  const difference = Math.abs(expected - received);

  if (difference > 0.01) {
    throw new Error(
      `Payment mismatch. Expected ${expected}, received ${received}`
    );
  }

  return true;
}