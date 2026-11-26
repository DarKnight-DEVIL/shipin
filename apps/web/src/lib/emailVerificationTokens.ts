import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Email-verification links that do not expire.
 *
 * Firebase's own verification link is bounded by a project setting, so a customer
 * who reads their mail a day later - or one whose mail only gets checked on Mondays -
 * finds a dead link and has to start over. A dead link costs a resend, a resend costs
 * a mail, and mail costs sender reputation. Making the link permanent removes that
 * loop, which is also the resource answer: nothing is stored per send, and a resend
 * re-derives the same link instead of minting one.
 *
 * The trade is a little security for availability, so it is contained:
 *
 *   - the signature is an HMAC over (uid, address, version) with a server secret, so
 *     a token cannot be forged without that secret and cannot be guessed (32 bytes);
 *   - nothing token-like is stored. There is no collection to grow, no plaintext in
 *     the database, and no index to maintain - a token is recomputed, not looked up;
 *   - it is single-use in effect: redeeming bumps a per-account version, which
 *     invalidates that link and every older one. A forwarded or archived email stops
 *     working once it has been used;
 *   - it verifies one address. The address is part of what is signed, so a token
 *     issued for an old address fails against a new one;
 *   - it reveals only the uid, which the customer already knows.
 *
 * The version lives on the profile document, which the resend route already reads, so
 * a resend costs one read and one write (the cooldown stamp it already wrote).
 */

/** The account field that invalidates older links. Absent means 0. */
export const VERIFICATION_VERSION_FIELD = "verificationTokenVersion";

const TOKEN_SEPARATOR = ".";

export interface VerificationTokenInput {
  uid: string;
  email: string;
  version: number;
  secret: string;
}

/**
 * The signature half of a token.
 *
 * Lower-cased address, because mail is case-insensitive in practice and a token
 * issued for `A@x.com` must not fail for `a@x.com`.
 */
function sign({
  uid,
  email,
  version,
  secret,
}: VerificationTokenInput): Buffer {
  return createHmac("sha256", secret)
    .update(`${uid}:${email.trim().toLowerCase()}:${version}`)
    .digest();
}

/** `uid.signature` - URL-safe, so it survives being pasted into a browser. */
export function issueVerificationToken(input: VerificationTokenInput): string {
  return `${input.uid}${TOKEN_SEPARATOR}${sign(input).toString("base64url")}`;
}

/** Splits a token without trusting it; the caller still has to check the signature. */
export function parseVerificationToken(
  token: string
): { uid: string; signature: string } | null {
  const index = token.indexOf(TOKEN_SEPARATOR);

  if (index <= 0 || index === token.length - 1) return null;

  const uid = token.slice(0, index);
  const signature = token.slice(index + 1);

  // A Firebase uid never contains a dot; anything else here is a malformed token.
  if (!/^[A-Za-z0-9_-]{4,128}$/.test(uid)) return null;
  if (!/^[A-Za-z0-9_-]{20,200}$/.test(signature)) return null;

  return { uid, signature };
}

/** Constant-time comparison, so a wrong token cannot be narrowed down by timing. */
export function verificationTokenMatches(
  input: VerificationTokenInput,
  presentedSignature: string
): boolean {
  let presented: Buffer;

  try {
    presented = Buffer.from(presentedSignature, "base64url");
  } catch {
    return false;
  }

  const expected = sign(input);

  // Length is not a secret; `timingSafeEqual` throws on a mismatch.
  if (presented.length !== expected.length) return false;

  return timingSafeEqual(presented, expected);
}

/**
 * The secret used to sign links.
 *
 * Mirrors `unsubscribeToken.ts`: `MFA_SESSION_SECRET` is already a required
 * production secret, so a deployment without a dedicated one still gets permanent
 * links instead of silently falling back to Firebase's bounded ones.
 * `EMAIL_VERIFICATION_SECRET` overrides it when an operator wants separation.
 *
 * Returns null rather than throwing: the resend route then uses Firebase's link, so a
 * missing variable degrades the expiry rather than breaking signup mail.
 */
export function verificationSecret(): string | null {
  const secret =
    process.env.EMAIL_VERIFICATION_SECRET?.trim() ||
    process.env.MFA_SESSION_SECRET?.trim() ||
    "";

  return secret.length >= 32 ? secret : null;
}

/** A suggested secret for a new environment, printed by the setup helper only. */
export function generateVerificationSecret(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * The account's token version, or 0 for one that has never had a link issued.
 *
 * Takes the raw field value rather than a snapshot so both callers can pass what they
 * already have: `snapshot.get(...)` in the routes, and the same from their doubles.
 */
export function verificationVersion(value: unknown): number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0
    ? value
    : 0;
}

/** The link a customer clicks. Absolute, because it is going into an email. */
export function verificationLink(baseUrl: string, token: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/verify-email?token=${encodeURIComponent(token)}`;
}
