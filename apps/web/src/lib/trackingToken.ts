/**
 * Signed public tracking lookup tokens — SERVER ONLY.
 *
 * `/api/tracking/:trackingId` is public, and the tracking id is the whole
 * access control. Newly minted ids (`SHP-` + 16 Crockford characters) already
 * carry 80 bits of entropy, so they are their own secret. Ids issued under the
 * old sequential scheme (`SHP-YYYY-NNNNNN`) do not, and keeping them readable
 * by id alone is what let anyone walk every parcel in order.
 *
 * A lookup token is an HMAC of the id with a server secret. A legacy id is
 * served only when the request also presents a valid token, which cannot be
 * forged or produced from the id alone. Modern ids keep working without one so
 * labels already printed remain valid; the token is still verified whenever it
 * is present, so a tampered signed link cannot fall back to the bare id.
 *
 * `TRACKING_TOKEN_SECRET` gives tracking links their own key. When it is unset,
 * the required `MFA_SESSION_SECRET` is used (as the unsubscribe links do), so a
 * deployment always has a secret without a new boot requirement.
 */
import crypto from "node:crypto";

const PURPOSE = "public-tracking";
const MIN_SECRET_LENGTH = 16;

/**
 * 22 base64url characters = 132 bits. Plenty against online guessing and short
 * enough to keep a shared URL readable.
 */
const TOKEN_LENGTH = 22;

/** The shape `generateTrackingId` mints: 16 Crockford base32 characters. */
const MODERN_TRACKING_ID = /^SHP-[0-9A-HJKMNP-TV-Z]{16}$/;

function signingSecret(): string | null {
  const secret =
    process.env.TRACKING_TOKEN_SECRET ?? process.env.MFA_SESSION_SECRET ?? "";

  return secret.length >= MIN_SECRET_LENGTH ? secret : null;
}

/** True for an id whose own entropy already makes it unguessable. */
export function isModernTrackingId(trackingId: string): boolean {
  return MODERN_TRACKING_ID.test(trackingId);
}

export function createTrackingToken(trackingId: string): string | null {
  const secret = signingSecret();
  if (!secret || !trackingId) return null;

  return crypto
    .createHmac("sha256", secret)
    .update(`${PURPOSE}:${trackingId}`)
    .digest("base64url")
    .slice(0, TOKEN_LENGTH);
}

export function verifyTrackingToken(
  trackingId: string,
  token: string
): boolean {
  const expected = createTrackingToken(trackingId);
  if (!expected || !token) return false;

  const expectedBuffer = Buffer.from(expected);
  const tokenBuffer = Buffer.from(token);

  return (
    expectedBuffer.length === tokenBuffer.length &&
    crypto.timingSafeEqual(expectedBuffer, tokenBuffer)
  );
}

/**
 * The id the public route may look up, or null when the caller has not proved
 * it may see it.
 *
 * - A modern random id is accepted bare (and with a valid token).
 * - Any other id, including the legacy sequential format and old document-id
 *   links, needs a valid token.
 * - A token that is present but invalid never falls back to the bare id.
 */
export function authorizePublicTrackingId(
  rawTrackingId: string,
  token: string | null | undefined
): string | null {
  const trackingId = rawTrackingId.trim();
  if (!trackingId) return null;

  if (token) {
    return verifyTrackingToken(trackingId, token) ? trackingId : null;
  }

  return isModernTrackingId(trackingId) ? trackingId : null;
}

/**
 * Canonical public tracking URL for a shipment, or null when no safe URL can be
 * built. Signed whenever a secret is available, so shared links carry the
 * authorisation even for ids that need one.
 */
export function createPublicTrackingUrl(trackingId: string): string | null {
  const id = trackingId.trim();
  if (!id) return null;

  const encoded = encodeURIComponent(id);
  const token = createTrackingToken(id);

  if (!token) {
    return isModernTrackingId(id) ? `/track/${encoded}` : null;
  }

  return `/track/${encoded}?token=${encodeURIComponent(token)}`;
}
