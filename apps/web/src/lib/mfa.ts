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
export function verifyTotp(secret: string, code: string, window: number = 1): boolean {
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
 * @param count - Number of backup codes to generate
 * @returns Array of backup codes (plain text, to be shown once)
 */
export function generateBackupCodes(count: number = BACKUP_CODE_COUNT): string[] {
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    const code = crypto.randomBytes(4).toString("hex").toUpperCase();
    codes.push(`${code.slice(0, 4)}-${code.slice(4, 8)}`);
  }
  return codes;
}

/**
 * Hash a backup code for storage.
 */
export function hashBackupCode(code: string): string {
  return crypto.createHash("sha256").update(code.trim().toUpperCase()).digest("hex");
}

/**
 * Verify a backup code against stored hashes.
 *
 * @param code - The backup code to verify
 * @param hashedCodes - Array of SHA-256 hashed backup codes
 * @returns Index of the matched code, or -1 if not found
 */
export function verifyBackupCode(code: string, hashedCodes: string[]): number {
  const hash = hashBackupCode(code);
  return hashedCodes.indexOf(hash);
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

/**
 * SMS MFA helpers.
 */

/** SMS code validity window in seconds (5 minutes). */
export const SMS_CODE_TTL_MS = 5 * 60 * 1000;

/**
 * Generate a 6-digit SMS verification code.
 */
export function generateSmsCode(): string {
  return crypto.randomInt(100000, 1000000).toString();
}

/**
 * Hash an SMS code for storage.
 */
export function hashSmsCode(code: string): string {
  return crypto.createHash("sha256").update(code).digest("hex");
}
