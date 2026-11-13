import { Timestamp } from "firebase/firestore";

function toMillis(value?: Timestamp | Date | string): number | null {
  if (!value) return null;

  // Duck-type instead of `value instanceof Timestamp`. The client SDK, the
  // Admin SDK and test doubles each provide their own Timestamp constructor for
  // the same value, so an identity check silently treats a real expiry as "no
  // expiry" — which is how expired quotes stayed valid on the server.
  if (typeof (value as unknown as { toMillis?: () => number }).toMillis === "function") {
    return (value as unknown as { toMillis: () => number }).toMillis();
  }

  if (value instanceof Date) {
    return value.getTime();
  }

  // value is now narrowed to string (Timestamp handled above by duck-type).
  // Cast through unknown because TypeScript cannot narrow past the duck-type
  // check, and Timestamp is not directly comparable to string.
  const d = new Date(value as unknown as string);
  return Number.isFinite(d.getTime()) ? d.getTime() : null;
}

/** True only when an expiry is set and that time has passed. */
export function isQuoteExpired(
  expiresAt?: Timestamp | Date | string
): boolean {
  const ms = toMillis(expiresAt);
  if (ms === null) return false;
  return ms <= Date.now();
}

export function getRemainingTime(expiresAt?: Timestamp | Date | string) {
  const ms = toMillis(expiresAt);
  if (ms === null) {
    return { hours: 0, minutes: 0, seconds: 0, expired: false, totalMs: 0 };
  }

  const remaining = ms - Date.now();

  if (remaining <= 0) {
    return { hours: 0, minutes: 0, seconds: 0, expired: true, totalMs: 0 };
  }

  return {
    hours: Math.floor(remaining / 3600000),
    minutes: Math.floor((remaining % 3600000) / 60000),
    seconds: Math.floor((remaining % 60000) / 1000),
    expired: false,
    totalMs: remaining,
  };
}
