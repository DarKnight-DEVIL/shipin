import type { Timestamp } from "firebase/firestore";

/**
 * Milliseconds for a quote expiry, or null when there is no readable one.
 *
 * Accepts every shape a quote has carried historically:
 *
 *   Firestore Timestamp   duck-typed, not `instanceof`. The client SDK, the
 *                         Admin SDK and test doubles each export their own
 *                         Timestamp constructor for the same value, so an
 *                         identity check treats a real expiry as "no expiry" —
 *                         which is how expired quotes stayed valid on the server.
 *   Date                  what server-side writers pass before Firestore stores it
 *   string                an ISO date, from a client that sent JSON
 *   number                epoch milliseconds
 *   { seconds, nanos }    a Timestamp that went through JSON
 */
export function parseQuoteExpiry(value?: unknown): number | null {
  if (!value) return null;

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  const duck = value as { toMillis?: () => number };
  if (typeof duck.toMillis === "function") {
    const ms = duck.toMillis();
    return Number.isFinite(ms) ? ms : null;
  }

  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isFinite(ms) ? ms : null;
  }

  if (typeof value === "string") {
    const ms = new Date(value).getTime();
    return Number.isFinite(ms) ? ms : null;
  }

  return parseSerializedTimestamp(value);
}

/** A Timestamp serialized as a plain object: `{ seconds, nanoseconds }`. */
function parseSerializedTimestamp(value: unknown): number | null {
  if (typeof value !== "object" || value === null) return null;

  const record = value as Record<string, unknown>;
  const seconds = record.seconds ?? record._seconds;
  if (typeof seconds !== "number" || !Number.isFinite(seconds)) return null;

  const nanoseconds = record.nanoseconds ?? record._nanoseconds;
  const millis =
    typeof nanoseconds === "number" ? Math.floor(nanoseconds / 1e6) : 0;

  return seconds * 1000 + millis;
}

/** True only when an expiry is set and that time has passed. */
export function isQuoteExpired(expiresAt?: Timestamp | Date | string): boolean {
  const ms = parseQuoteExpiry(expiresAt);
  return ms !== null && ms <= Date.now();
}

export function getRemainingTime(expiresAt?: Timestamp | Date | string) {
  const ms = parseQuoteExpiry(expiresAt);
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
