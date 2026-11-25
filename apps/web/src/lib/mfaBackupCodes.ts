/**
 * Backup-code hashing, kept out of `lib/mfa.ts` so it has no `server-only`
 * import and can be used by the break-glass script as well as the API routes.
 *
 * One implementation matters here: a code hashed by the app must verify against
 * a hash written by the script and vice versa. They are the same scrypt
 * parameters in one place instead of two copies that drift.
 */

import crypto from "crypto";

/** Salt (16 bytes) + derived key (64 bytes), hex encoded: 32 + 128 = 160 chars. */
const SALT_BYTES = 16;
const KEY_BYTES = 64;
const STORED_HASH_LENGTH = (SALT_BYTES + KEY_BYTES) * 2;

/** scrypt cost parameters. Changing them invalidates every stored code. */
const SCRYPT = { N: 16384, r: 8, p: 1 } as const;

/**
 * Hash one backup code for storage.
 *
 * The plaintext code is never stored, so a leak of the user document does not
 * hand out a second factor. Codes are normalised (trimmed, upper-cased) because
 * every client that prints them uses capitals.
 */
export function hashBackupCode(code: string): string {
  const salt = crypto.randomBytes(SALT_BYTES);
  const derivedKey = crypto.scryptSync(
    code.trim().toUpperCase(),
    salt,
    KEY_BYTES,
    SCRYPT
  );

  return salt.toString("hex") + derivedKey.toString("hex");
}

/**
 * Verify a code against stored hashes.
 *
 * @returns the index of the matching code, or -1. The index lets the caller
 *          consume the code it used; the comparison is constant-time.
 */
export function verifyBackupCode(code: string, hashedCodes: string[]): number {
  const candidate = code.trim().toUpperCase();

  for (const [index, storedHash] of hashedCodes.entries()) {
    // A truncated or plaintext entry cannot be verified; skipping it keeps a
    // legacy document from throwing on every login attempt.
    if (typeof storedHash !== "string" || storedHash.length !== STORED_HASH_LENGTH) {
      continue;
    }

    const storedSalt = Buffer.from(storedHash.slice(0, SALT_BYTES * 2), "hex");
    const storedDerivedKey = Buffer.from(storedHash.slice(SALT_BYTES * 2), "hex");

    const derivedKey = crypto.scryptSync(candidate, storedSalt, KEY_BYTES, SCRYPT);

    if (
      derivedKey.length === storedDerivedKey.length &&
      crypto.timingSafeEqual(derivedKey, storedDerivedKey)
    ) {
      return index;
    }
  }

  return -1;
}
