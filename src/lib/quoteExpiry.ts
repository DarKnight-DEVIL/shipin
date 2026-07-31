import { Timestamp } from "firebase/firestore";

function toMillis(
  value?: Timestamp | Date | string
): number {
  if (!value) return 0;

  if (value instanceof Timestamp) {
    return value.toMillis();
  }

  if (value instanceof Date) {
    return value.getTime();
  }

  return new Date(value).getTime();
}

export function isQuoteExpired(
  expiresAt?: Timestamp | Date | string
) {
  return toMillis(expiresAt) <= Date.now();
}

export function getRemainingTime(
  expiresAt?: Timestamp | Date | string
) {
  const remaining = toMillis(expiresAt) - Date.now();

  if (remaining <= 0) {
    return {
      hours: 0,
      minutes: 0,
      seconds: 0,
    };
  }

  return {
    hours: Math.floor(remaining / 3600000),
    minutes: Math.floor(
      (remaining % 3600000) / 60000
    ),
    seconds: Math.floor(
      (remaining % 60000) / 1000
    ),
  };
}