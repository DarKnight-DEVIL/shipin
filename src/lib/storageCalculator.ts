export function calculateStorageFee(
  holdStartedAt?: Date
) {
  if (!holdStartedAt) {
    return {
      days: 0,
      fee: 0,
    };
  }

  const now = new Date();

  const diff =
    now.getTime() -
    holdStartedAt.getTime();

  const days =
    Math.floor(
      diff /
        (1000 * 60 * 60 * 24)
    );

  return {
    days,

    fee: days * 3,
  };
}