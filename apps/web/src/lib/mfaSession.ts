/**
 * Admin MFA session (elevation) — SERVER ONLY.
 *
 * `requireAdmin` needs proof that an administrator completed MFA. Rather than
 * sending a TOTP/SMS code with every single API request, the admin verifies
 * once and receives a short-lived, signed, HttpOnly cookie. Every admin route
 * then accepts that cookie as MFA proof for its lifetime.
 *
 * Design notes:
 *
 *  - The cookie payload is `version.uid.issuedAt.expiresAt.jti` and is signed
 *    with HMAC-SHA256. It carries no secret data and cannot be forged without
 *    the signing key. The `jti` is what makes server-side revocation possible:
 *    a `Set-Cookie` that clears the browser copy does nothing about a token
 *    copied out of an earlier request.
 *  - HttpOnly + SameSite=Strict + Secure (in production) means page scripts
 *    cannot read it and other origins cannot send it.
 *  - The session only proves *MFA was completed*. `requireAdmin` still verifies
 *    the Firebase ID token and re-reads `users/{uid}.role === "admin"` on every
 *    request, so revoking the admin role immediately revokes access.
 *  - Default lifetime is twelve hours: one working day for a single-operator console.
 */

import "server-only";

import crypto from "crypto";

import { isProduction, serverEnv } from "@/config/env";
import { denyMfaSession, isMfaSessionDenied } from "./mfaDenylist";
import { createSecureCookieHeader } from "./securityHeaders";

export const MFA_SESSION_COOKIE = "shipin_admin_mfa";
/**
 * How long an elevated admin session lasts.
 *
 * Twelve hours rather than thirty minutes: this console has one operator, so
 * the short window was re-prompting for a code several times a day without
 * removing a threat that the code itself already covers - the factor is
 * required once per browser session, not once per click.
 *
 * Deliberately absolute, not sliding: refreshing does not extend it, so a
 * forgotten browser cannot stay elevated for ever. Revocation still works
 * per-session through the denylist, and every admin request re-checks the
 * role, so removing admin access takes effect immediately regardless.
 */
export const MFA_SESSION_TTL_MS = 12 * 60 * 60 * 1000;

// Bumped when `jti` was added. Version 1 tokens cannot be revoked server-side,
// so they are rejected rather than honoured: the cost is that every admin
// re-elevates once after this deploys, which is the safe direction.
const SESSION_VERSION = 2;

export interface MfaSession {
  uid: string;
  /** Unix epoch seconds. */
  expiresAt: number;
  /** Session id, used by the revocation list. */
  jti: string;
}

/**
 * Signing key for session tokens.
 *
 * Deliberately a dedicated secret: deriving it from the Firebase Admin private
 * key would mean that key doubles as an MFA-forgery key, so a leak would be
 * worse than losing API access. A missing secret is a configuration error and
 * fails closed rather than falling back to anything.
 */
function getSigningKey(): Buffer {
  const secret = serverEnv.MFA_SESSION_SECRET;

  if (!secret || secret.length < 32) {
    throw new Error(
      "MFA_SESSION_SECRET is required (min 32 chars) to sign admin MFA sessions."
    );
  }

  return Buffer.from(secret, "utf8");
}

function sign(payload: string): string {
  return crypto
    .createHmac("sha256", getSigningKey())
    .update(payload)
    .digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");

  if (left.length !== right.length) return false;

  return crypto.timingSafeEqual(left, right);
}

/** Mint a session token for `uid`. */
export function createMfaSessionToken(
  uid: string,
  now: number = Date.now()
): { token: string; expiresAt: number; jti: string } {
  const issuedAt = Math.floor(now / 1000);
  const expiresAt = issuedAt + Math.floor(MFA_SESSION_TTL_MS / 1000);
  // Random per session, so revoking one leaves the account's other sessions
  // alone. 128 bits is far more than enough to make collisions impossible.
  const jti = crypto.randomBytes(16).toString("base64url");
  const payload = `${SESSION_VERSION}.${uid}.${issuedAt}.${expiresAt}.${jti}`;
  const encoded = Buffer.from(payload, "utf8").toString("base64url");

  return { token: `${encoded}.${sign(payload)}`, expiresAt, jti };
}

/** Verify a session token. Returns null for anything invalid or expired. */
export function verifyMfaSessionToken(
  token: string | null | undefined,
  now: number = Date.now()
): MfaSession | null {
  if (!token) return null;

  const separator = token.lastIndexOf(".");

  if (separator <= 0 || separator === token.length - 1) return null;

  const encoded = token.slice(0, separator);
  const signature = token.slice(separator + 1);

  let payload: string;

  try {
    payload = Buffer.from(encoded, "base64url").toString("utf8");
  } catch {
    return null;
  }

  if (!safeEqual(signature, sign(payload))) return null;

  return parseMfaSessionPayload(payload, now);
}

/**
 * Validate an already-signature-verified payload.
 *
 * Split out so the version and `jti` rules can be tested directly: a forged
 * signature is rejected earlier, and a test cannot construct a validly signed
 * version-1 payload without the signing key.
 */
export function parseMfaSessionPayload(
  payload: string,
  now: number = Date.now()
): MfaSession | null {
  const [version, uid, issuedAt, expiresAt, jti] = payload.split(".");

  // Version 1 predates `jti`, so it cannot be revoked; it is rejected outright.
  if (version !== String(SESSION_VERSION) || !uid) return null;
  if (!jti) return null;

  const expires = Number(expiresAt);
  const issued = Number(issuedAt);

  if (!Number.isFinite(expires) || !Number.isFinite(issued)) return null;

  const nowSeconds = Math.floor(now / 1000);

  if (expires <= nowSeconds) return null;

  // Reject tokens "issued in the future" beyond a small clock skew allowance.
  if (issued > nowSeconds + 60) return null;

  return { uid, expiresAt: expires, jti };
}

/** Read a cookie value from a request's `cookie` header. */
export function readRequestCookie(
  request: Request,
  name: string
): string | null {
  const header = request.headers.get("cookie");

  if (!header) return null;

  for (const part of header.split(";")) {
    const separator = part.indexOf("=");

    if (separator === -1) continue;

    if (part.slice(0, separator).trim() === name) {
      return decodeURIComponent(part.slice(separator + 1).trim());
    }
  }

  return null;
}

/**
 * The verified, non-revoked MFA session on this request, if any.
 *
 * Async because revocation lives in Redis: a valid signature is no longer
 * enough on its own once a session can be revoked before it expires.
 */
export async function getMfaSession(
  request: Request
): Promise<MfaSession | null> {
  const session = verifyMfaSessionToken(
    readRequestCookie(request, MFA_SESSION_COOKIE)
  );

  if (!session) return null;

  if (await isMfaSessionDenied(session.jti)) return null;

  return session;
}

/**
 * Revoke a session server-side, for the remainder of its lifetime.
 *
 * Called by sign-out: clearing the cookie only helps the browser that made the
 * request, while this stops a copied token from verifying anywhere.
 */
export async function revokeMfaSession(session: MfaSession): Promise<void> {
  await denyMfaSession(session.jti, session.expiresAt);
}

/** `Set-Cookie` value that starts a session. */
export function createMfaSessionCookieHeader(token: string): string {
  return createSecureCookieHeader(MFA_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "strict",
    path: "/",
    maxAge: Math.floor(MFA_SESSION_TTL_MS / 1000),
  });
}

/**
 * `Set-Cookie` value that ends a session.
 *
 * Built explicitly because the shared helper only emits `Max-Age` for non-zero
 * values, and a removal cookie needs `Max-Age=0` plus an expiry in the past.
 */
export function clearMfaSessionCookieHeader(): string {
  const parts = [
    `${MFA_SESSION_COOKIE}=`,
    "Path=/",
    "Max-Age=0",
    "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
    "HttpOnly",
    "SameSite=Strict",
  ];

  if (isProduction) parts.push("Secure");

  return parts.join("; ");
}
