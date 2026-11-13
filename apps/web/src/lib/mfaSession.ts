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
 *  - The cookie payload is `version.uid.issuedAt.expiresAt` and is signed with
 *    HMAC-SHA256. It carries no secret data and cannot be forged without the
 *    signing key.
 *  - HttpOnly + SameSite=Strict + Secure (in production) means page scripts
 *    cannot read it and other origins cannot send it.
 *  - The session only proves *MFA was completed*. `requireAdmin` still verifies
 *    the Firebase ID token and re-reads `users/{uid}.role === "admin"` on every
 *    request, so revoking the admin role immediately revokes access.
 *  - Default lifetime is 30 minutes, matching a single admin work session.
 */

import "server-only";

import crypto from "crypto";

import { isProduction, serverEnv } from "@/config/env";
import { createSecureCookieHeader } from "./securityHeaders";

export const MFA_SESSION_COOKIE = "shipin_admin_mfa";
export const MFA_SESSION_TTL_MS = 30 * 60 * 1000;

const SESSION_VERSION = 1;

export interface MfaSession {
  uid: string;
  /** Unix epoch seconds. */
  expiresAt: number;
}

/**
 * Signing key for session tokens.
 *
 * `MFA_SESSION_SECRET` is the preferred source. When it is absent we derive a
 * key from the Firebase Admin private key — which is a required secret in every
 * environment — so sessions work without extra configuration while never
 * relying on a hardcoded constant.
 */
function getSigningKey(): Buffer {
  const explicit = serverEnv.MFA_SESSION_SECRET;

  if (explicit && explicit.length >= 32) {
    return Buffer.from(explicit, "utf8");
  }

  const adminKey = serverEnv.FIREBASE_ADMIN_PRIVATE_KEY;

  if (!adminKey) {
    throw new Error(
      "MFA session signing key unavailable: set MFA_SESSION_SECRET (min 32 chars) or FIREBASE_ADMIN_PRIVATE_KEY."
    );
  }

  return crypto
    .createHmac("sha256", Buffer.from(adminKey, "utf8"))
    .update("shipin:mfa-session:v1")
    .digest();
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
): { token: string; expiresAt: number } {
  const issuedAt = Math.floor(now / 1000);
  const expiresAt = issuedAt + Math.floor(MFA_SESSION_TTL_MS / 1000);
  const payload = `${SESSION_VERSION}.${uid}.${issuedAt}.${expiresAt}`;
  const encoded = Buffer.from(payload, "utf8").toString("base64url");

  return { token: `${encoded}.${sign(payload)}`, expiresAt };
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

  const [version, uid, issuedAt, expiresAt] = payload.split(".");

  if (version !== String(SESSION_VERSION) || !uid) return null;

  const expires = Number(expiresAt);
  const issued = Number(issuedAt);

  if (!Number.isFinite(expires) || !Number.isFinite(issued)) return null;

  const nowSeconds = Math.floor(now / 1000);

  if (expires <= nowSeconds) return null;

  // Reject tokens "issued in the future" beyond a small clock skew allowance.
  if (issued > nowSeconds + 60) return null;

  return { uid, expiresAt: expires };
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

/** The verified MFA session on this request, if any. */
export function getMfaSession(request: Request): MfaSession | null {
  return verifyMfaSessionToken(readRequestCookie(request, MFA_SESSION_COOKIE));
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
