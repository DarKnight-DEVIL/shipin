/**
 * Customer-facing tracking ids — SERVER ONLY.
 *
 * A tracking id is the only thing guarding `/api/tracking/:trackingId`, which is
 * a public endpoint: whatever is printed on a label is enough to read a
 * shipment's status and every event location on it. The previous scheme
 * (`SHP-<year>-<counter>`) was sequential, so one id read off a parcel revealed
 * the journey of every shipment minted before or after it.
 *
 * A random id removes the walk: 16 characters from Crockford's base32 alphabet
 * is 80 bits, so guessing a live id costs ~2^80 attempts. The alphabet omits I,
 * L, O and U, keeping a number read off a label or dictated over the phone
 * unambiguous. Ids already issued in the old format keep working — lookup is by
 * the stored value, not by parsing it.
 */
import { randomBytes } from "node:crypto";

/** Crockford base32: no I, L, O or U. */
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** 16 characters × 5 bits = 80 bits of entropy. */
const RANDOM_CHARS = 16;

export const TRACKING_ID_PREFIX = "SHP-";

/**
 * Mint a tracking id.
 *
 * Each byte is masked to 5 bits. 32 divides 256 evenly, so every character is
 * drawn uniformly — this is not `% 32` over a byte with a bias.
 */
export function generateTrackingId(): string {
  const bytes = randomBytes(RANDOM_CHARS);

  let id = TRACKING_ID_PREFIX;

  for (const byte of bytes) {
    id += ALPHABET[byte & 0x1f];
  }

  return id;
}
