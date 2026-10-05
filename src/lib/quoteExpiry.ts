import { Timestamp } from "firebase/firestore";

function toMillis(
  value?: Timestamp | Date | string | null
): number | null {
  if (!value) return null;

  if (value instanceof Timestamp) {
    return value.toMillis();
  }

  if (value instanceof Date) {
    return value.getTime();
  }

  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

/** True only when an expiry date exists and is in the past. */
export function isQuoteExpired(
  expiresAt?: Timestamp | Date | string | null
): boolean {
  const ms = toMillis(expiresAt);
  if (ms === null) return false;
  return ms <= Date.now();
}

export function getRemainingTime(
  expiresAt?: Timestamp | Date | string | null
) {
  const ms = toMillis(expiresAt);
  if (ms === null) {
    return { hours: 0, minutes: 0, seconds: 0, expired: false };
  }

  const remaining = ms - Date.now();

  if (remaining <= 0) {
    return { hours: 0, minutes: 0, seconds: 0, expired: true };
  }

  return {
    hours: Math.floor(remaining / 3600000),
    minutes: Math.floor((remaining % 3600000) / 60000),
    seconds: Math.floor((remaining % 60000) / 1000),
    expired: false,
  };
}