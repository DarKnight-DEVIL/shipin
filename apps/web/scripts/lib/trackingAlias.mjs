// Pure helpers for tracking aliases, shared by scripts/rotate-tracking-aliases.mjs
// and its unit test. Nothing here touches Firestore or R2.
//
// An alias looks like `SHP-<trackingId>-<8 chars>`; the suffix is Crockford
// base32 so it never contains I, L, O or U.

import { randomBytes } from "node:crypto";

export const ALIAS_EXPIRY_DAYS = 90;
export const ALIAS_LENGTH = 8;
export const TRACKING_ID_PREFIX = "SHP-";

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/**
 * Generate a random 8-character alias suffix using Crockford base32
 * (avoids I, L, O, U for unambiguous communication).
 */
export function generateAliasSuffix(bytes = randomBytes(ALIAS_LENGTH)) {
  let suffix = "";
  for (const byte of bytes) {
    suffix += ALPHABET[byte & 0x1f];
  }
  return suffix;
}

/**
 * Build an alias: SHP-<trackingId>-<8 random chars>
 */
export function buildAlias(trackingId) {
  return `${TRACKING_ID_PREFIX}${trackingId}-${generateAliasSuffix()}`;
}

/**
 * Parse an alias to extract the underlying tracking ID.
 * Returns the trackingId portion, or null if the alias is malformed.
 */
export function parseAlias(trackingAlias) {
  const match = /^SHP-([A-Z0-9]+)-[0-9A-HJKMNP-TV-Z]{8}$/.exec(
    String(trackingAlias)
  );
  return match ? match[1] : null;
}

/**
 * Check if an alias has expired based on its expiresAt timestamp.
 * A missing expiry counts as expired so cleanup removes it.
 */
export function hasExpired(expiresAt, now = new Date()) {
  if (!expiresAt) return true;
  return now > new Date(expiresAt);
}
