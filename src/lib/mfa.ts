import "server-only";

import crypto from "crypto";

/**
 * TOTP (Time-based One-Time Password) service.
 *
 * Implements RFC 6238 TOTP with SHA-1, 6-digit codes, 30-second step.
 * Compatible with Google Authenticator, Authy, 1Password, etc.
 */

const TOTP_STEP = 30;
const TOTP_DIGITS = 6;
const TOTP_PERIOD = 30;
const BACKUP_CODE_COUNT = 10;

/**
 * Base32 encoding/decoding helpers (RFC 4648).
 * Node.js Buffer doesn't support base32 natively.
 */
const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = "";

  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;

    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }

  // Add padding
  const padding = (8 - (output.length % 8)) % 8;
  return output + "=".repeat(padding);
}

function base32Decode(str: string): Buffer {
  // Remove padding
  str = str.replace(/=/g, "").toUpperCase();
  let bits = 0;
  let value = 0;
  const output: number[] = [];

  for (const char of str) {
    const idx = BASE32_ALPHABET.indexOf(char);
    if (idx === -1) continue;

    value = (value << 5) | idx;
    bits += 5;

    if (bits >= 8) {
      output.push((value >> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }

  return Buffer.from(output);
}

/**
 * Generate a random base32-encoded secret.
 */
export function generateTotpSecret(): string {
  const randomBytes = crypto.randomBytes(20);
  return base32Encode(randomBytes);
}

/**
 * Generate a TOTP code for the given secret and time.
 */
function generateTotp(secret: string, time: number): string {
  const timeStep = Math.floor(time / TOTP_STEP);
  const timeBuffer = Buffer.alloc(8);
  timeBuffer.writeBigUInt64BE(BigInt(timeStep), 0);

  const secretBuffer = base32Decode(secret);
  const hmac = crypto.createHmac("sha1", secretBuffer);
  hmac.update(timeBuffer);
  const hash = hmac.digest();

  const offset = hash[hash.length - 1] & 0x0f;
  const binary =
    ((hash[offset] & 0x7f) << 24) |
    ((hash[offset + 1] & 0xff) << 16) |
    ((hash[offset + 2] & 0xff) << 8) |
    (hash[offset + 3] & 0xff);

  const code = binary % Math.pow(10, TOTP_DIGITS);
  return code.toString().padStart(TOTP_DIGITS, "0");
}

/**
 * Verify a TOTP code.
 *
 * @param secret - Base32-encoded secret
 * @param code - 6-digit code to verify
 * @param window - Number of time steps to check (default 1)
 * @returns true if the code is valid
 */
export function verifyTotp(secret: string, code: string, window: number = 1): boolean {
  if (!code || code.length !== TOTP_DIGITS) return false;

  const currentTime = Math.floor(Date.now() / 1000);

  for (let i = -window; i <= window; i++) {
    const time = currentTime + i * TOTP_STEP;
    if (generateTotp(secret, time) === code) {
      return true;
    }
  }

  return false;
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
  return crypto.createHash("sha256").update(code).digest("hex");
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
 * Generate a QR code URL for TOTP enrollment.
 *
 * @param secret - Base32-encoded secret
 * @param issuer - Issuer name (e.g., "ShipIN")
 * @param account - User email or identifier
 * @returns otpauth:// URL for QR code scanning
 */
export function getTotpQrUrl(secret: string, issuer: string, account: string): string {
  const params = new URLSearchParams({
    secret,
    issuer,
    account,
    algorithm: "SHA1",
    digits: String(TOTP_DIGITS),
    period: String(TOTP_PERIOD),
  });
  return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(account)}?${params.toString()}`;
}

/**
 * WebAuthn/Passkey helpers.
 *
 * Uses the standard WebAuthn public key credential format.
 */

/**
 * Generate a random challenge for WebAuthn.
 */
export function generateWebAuthnChallenge(): string {
  return crypto.randomBytes(32).toString("base64url");
}

/**
 * Generate a random credential ID for WebAuthn.
 */
export function generateCredentialId(): string {
  return crypto.randomBytes(32).toString("base64url");
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
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * Hash an SMS code for storage.
 */
export function hashSmsCode(code: string): string {
  return crypto.createHash("sha256").update(code).digest("hex");
}

/**
 * WebAuthn assertion verification.
 *
 * Full implementation requires:
 * 1. Challenge stored in Firestore during registration/start
 * 2. Assertion signature verification using stored public key
 * 3. Signature counter check to prevent replay attacks
 *
 * This module provides the storage helpers; the actual cryptographic
 * verification is performed in the API route handler.
 */

export interface WebAuthnCredentialRecord {
  id: string;
  publicKey: string;
  counter: number;
  name: string;
  createdAt: number;
}

export interface PendingSmsChallenge {
  hashedCode: string;
  createdAt: number;
  uid: string;
  expiresAt: number;
  used: boolean;
}