import crypto from "crypto";

import { siteConfig } from "@/config/site";

/**
 * Signed, per-user link that turns off ShipIN email notifications in one click.
 *
 * Every customer email carries it, and it is also advertised in the
 * `List-Unsubscribe` headers so a mail client can offer its own button.
 *
 * The signature is an HMAC of the user id, so the route needs no session: the
 * link itself is the authorisation, it cannot be forged, and it cannot be
 * retargeted at another account. There is no expiry on purpose — an unsubscribe
 * link in a two-year-old email must still work — and the action it authorises is
 * only "stop emailing me", which is safe to allow more than once.
 */

const PURPOSE = "email-unsubscribe";
const MIN_SECRET_LENGTH = 16;

/**
 * Server secret used for the signature. `MFA_SESSION_SECRET` is already a
 * required production secret, so reusing it keeps the deployment surface small;
 * `UNSUBSCRIBE_SECRET` overrides it if the operator wants separation.
 *
 * Returns null rather than throwing: a deployment without a usable secret still
 * sends its transactional email, just without the unsubscribe footer. Silently
 * forging a weak signature would be worse.
 */
function signingSecret(): string | null {
  const secret =
    process.env.UNSUBSCRIBE_SECRET ?? process.env.MFA_SESSION_SECRET ?? "";

  return secret.length >= MIN_SECRET_LENGTH ? secret : null;
}

export function createUnsubscribeToken(userId: string): string | null {
  const secret = signingSecret();
  if (!secret || !userId) return null;

  return crypto
    .createHmac("sha256", secret)
    .update(`${PURPOSE}:${userId}`)
    .digest("base64url");
}

export function verifyUnsubscribeToken(userId: string, token: string): boolean {
  const expected = createUnsubscribeToken(userId);
  if (!expected || !token) return false;

  const expectedBuffer = Buffer.from(expected);
  const tokenBuffer = Buffer.from(token);

  return (
    expectedBuffer.length === tokenBuffer.length &&
    crypto.timingSafeEqual(expectedBuffer, tokenBuffer)
  );
}

/** Absolute link for an email footer, or null when the secret is missing. */
export function createUnsubscribeUrl(userId: string): string | null {
  const token = createUnsubscribeToken(userId);
  if (!token) return null;

  const base = siteConfig.url.replace(/\/+$/, "");
  return `${base}/api/notifications/unsubscribe?uid=${encodeURIComponent(
    userId
  )}&token=${encodeURIComponent(token)}`;
}

/**
 * RFC 8058 headers. `List-Unsubscribe-Post` is what lets Gmail and Apple Mail
 * show a native unsubscribe button that POSTs instead of visiting the page.
 */
export function buildUnsubscribeHeaders(
  url: string
): Record<string, string> {
  return {
    "List-Unsubscribe": `<${url}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
}
