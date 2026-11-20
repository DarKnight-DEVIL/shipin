import "server-only";

import crypto from "crypto";

import { generateSecret, generateURI, verifySync } from "otplib";
import QRCode from "qrcode";

/**
 * TOTP (Time-based One-Time Password) service.
 *
 * RFC 6238 TOTP with SHA-1, 6-digit codes, 30-second step — implemented by
 * `otplib`, so it stays compatible with Google Authenticator, Authy, 1Password,
 * and every other standard authenticator app.
 */

const TOTP_ISSUER = "ShipIN Admin";
const TOTP_PERIOD = 30;
const BACKUP_CODE_COUNT = 10;

/**
 * Generate a random base32-encoded secret (no padding).
 *
 * otplib emits unpadded base32, which is what authenticator apps expect and
 * what the previous hand-rolled encoder produced.
 */
export function generateTotpSecret(): string {
  return generateSecret();
}

/**
 * Verify a TOTP code.
 *
 * @param secret - Base32-encoded secret
 * @param code - 6-digit code to verify
 * @param window - Number of 30-second time steps to tolerate (default 1)
 * @returns true if the code is valid
 */
export function verifyTotp(
  secret: string,
  code: string,
  window: number = 1
): boolean {
  const token = code.trim();

  if (!/^\d{6}$/.test(token)) return false;

  try {
    const result = verifySync({
      secret,
      token,
      epochTolerance: TOTP_PERIOD * Math.max(0, window),
    });

    return result.valid;
  } catch {
    // Malformed secrets throw; treat them as a failed verification.
    return false;
  }
}

/**
 * Generate backup codes.
 *
 * 8 random bytes per code (64 bits), not 4: a 32-bit code space is small enough
 * to brute-force against an online endpoint.
 *
 * @param count - Number of backup codes to generate
 * @returns Array of backup codes (plain text, to be shown once)
 */
export function generateBackupCodes(
  count: number = BACKUP_CODE_COUNT
): string[] {
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    const code = crypto.randomBytes(8).toString("hex").toUpperCase();
    codes.push(
      `${code.slice(0, 4)}-${code.slice(4, 8)}-${code.slice(8, 12)}-${code.slice(12, 16)}`
    );
  }
  return codes;
}

/**
 * Hash a backup code for storage.
 *
 * Uses scrypt (slow, memory-hard function) to prevent brute-force attacks.
 * Output is salt (16 bytes = 32 hex chars) + derived key (64 bytes = 128 hex chars) = 160 hex chars total. * The salt is prepended to the derived key so it can be extracted during verification. */
export function hashBackupCode(code: string): string {
  const salt = crypto.randomBytes(16);
  const derivedKey = crypto.scryptSync(code.trim().toUpperCase(), salt, 64, { N: 16384, r: 8, p: 1 });
  // Salt is 16 bytes (32 hex chars), derived key is 64 bytes (128 hex chars)  return Buffer.from(salt).toString("hex") + derivedKey.toString("hex");
}

/**
 * Verify a backup code against stored hashes.
 *
 * Each stored hash is format: saltHex (32 chars) + derivedKeyHex (128 chars) = 160 chars total. * The salt is extracted and used with scrypt for constant-time comparison. *
 * @param code - The backup code to verify
 * @param hashedCodes - Array of scrypt-hashed backup codes (salt+derivedKey format) * @returns Index of the matched code, or -1 if not found
 */
export function verifyBackupCode(code: string, hashedCodes: string[]): number {
  for (let i = 0; i < hashedCodes.length; i++) {
    // Salt is first 32 hex chars (16 bytes), derived key is last 128 hex chars (64 bytes)    const storedHash = hashedCodes[i];    if (storedHash.length !== 160) continue;    const storedSalt = Buffer.from(storedHash.slice(0, 32), "hex");    const storedDerivedKey = Buffer.from(storedHash.slice(32), "hex");        // Derive key from code using the stored salt for constant-time comparison    const derivedKey = crypto.scryptSync(code.trim().toUpperCase(), storedSalt, 64, { N: 16384, r: 8, p: 1 });    const derivedKeyBuf = Buffer.from(derivedKey);        // Use constant-time comparison for both length and content    if (derivedKeyBuf.length === storedDerivedKey.length && crypto.timingSafeEqual(derivedKeyBuf, storedDerivedKey)) {
      return i;
    }  }  return -1;
}

/**
 * Build the `otpauth://` URI an authenticator app scans.
 *
 * @param secret - Base32-encoded secret
 * @param issuer - Issuer name (e.g., "ShipIN")
 * @param account - User email or identifier
 */
export function getTotpQrUrl(
  secret: string,
  issuer: string = TOTP_ISSUER,
  account: string
): string {
  return generateURI({
    strategy: "totp",
    issuer,
    label: `${issuer}:${account}`,
    secret,
  });
}

/**
 * Render an `otpauth://` URI as a PNG data URL.
 *
 * Generated server-side so the browser never needs a QR rendering library and
 * the enrollment payload stays inside the authenticated response.
 */
export async function renderTotpQrDataUrl(otpauthUrl: string): Promise<string> {
  return QRCode.toDataURL(otpauthUrl, {
    errorCorrectionLevel: "M",
    margin: 1,
    width: 336,
  });
}
