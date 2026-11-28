import "server-only";

import { FieldValue } from "firebase-admin/firestore";

import { adminDb } from "@/lib/firebaseAdmin";

/**
 * TOTP secrets, backup-code hashes and replay markers live here, not on
 * `users/{uid}`.
 *
 * `users/{uid}` is readable by its owner (firestore.rules) and is the document
 * the browser profile is built from. A TOTP secret on that document is therefore
 * a second factor an XSS could steal and use elsewhere; this collection has no
 * client rule, so only the Admin SDK can read it.
 */
export const USER_SECRETS_COLLECTION = "userSecrets";

export interface TotpSecrets {
  secret?: string;
  /** SHA-256 hashes of unused backup codes. */
  backupCodes?: string[];
  /** SHA-256 of the last accepted TOTP code, for replay refusal. */
  lastTotpCodeHash?: string;
  lastTotpVerifiedAt?: number;
  lastBackupCodeUsedAt?: number;
  /** Failed enrollment-verification attempts since the last success/reset. */
  verifyAttempts?: number;
  /** When the last failed attempt was seen; drives the enrollment lockout. */
  lastVerifyAttemptAt?: number;
}

export function userSecretsRef(uid: string) {
  return adminDb.collection(USER_SECRETS_COLLECTION).doc(uid);
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

/** Read only the fields this module understands, dropping anything else. */
export function parseTotpSecrets(value: unknown): TotpSecrets {
  if (typeof value !== "object" || value === null) return {};

  const record = value as Record<string, unknown>;
  const secret = nonEmptyString(record.secret);
  const backupCodes = Array.isArray(record.backupCodes)
    ? record.backupCodes.filter(
        (code): code is string => typeof code === "string" && code.length > 0
      )
    : undefined;
  const lastTotpCodeHash = nonEmptyString(record.lastTotpCodeHash);
  const lastTotpVerifiedAt = finiteNumber(record.lastTotpVerifiedAt);
  const lastBackupCodeUsedAt = finiteNumber(record.lastBackupCodeUsedAt);
  const verifyAttempts = finiteNumber(record.verifyAttempts);
  const lastVerifyAttemptAt = finiteNumber(record.lastVerifyAttemptAt);

  return {
    ...(secret ? { secret } : {}),
    ...(backupCodes ? { backupCodes } : {}),
    ...(lastTotpCodeHash ? { lastTotpCodeHash } : {}),
    ...(lastTotpVerifiedAt !== undefined ? { lastTotpVerifiedAt } : {}),
    ...(lastBackupCodeUsedAt !== undefined ? { lastBackupCodeUsedAt } : {}),
    ...(verifyAttempts !== undefined ? { verifyAttempts } : {}),
    ...(lastVerifyAttemptAt !== undefined ? { lastVerifyAttemptAt } : {}),
  };
}

/** Extract a legacy `users/{uid}.mfa.totp` record using the same allowlist. */
export function legacyTotpSecrets(profileMfa: unknown): TotpSecrets | null {
  if (typeof profileMfa !== "object" || profileMfa === null) return null;

  const totp = (profileMfa as Record<string, unknown>).totp;
  if (typeof totp !== "object" || totp === null) return null;

  const secrets = parseTotpSecrets(totp);
  return Object.keys(secrets).length > 0 ? secrets : null;
}

const LEGACY_FIELDS = [
  "mfa.totp.secret",
  "mfa.totp.backupCodes",
  "mfa.totp.lastTotpCodeHash",
  "mfa.totp.lastTotpVerifiedAt",
  "mfa.totp.lastBackupCodeUsedAt",
] as const;

function legacyDeletes() {
  return Object.fromEntries(
    LEGACY_FIELDS.map((field) => [field, FieldValue.delete()])
  );
}

/**
 * Load the secret record for an account.
 *
 * Deployments before this collection stored the same fields on the profile. A
 * profile that still carries them is migrated on first use: the secret is copied
 * into `userSecrets/{uid}` and removed from `users/{uid}` in one transaction, so
 * a concurrent request cannot see the secret in neither place. The public
 * `mfa.totp.enabled` flag stays on the profile for the admin list and for the
 * browser's own status display.
 */
export async function loadTotpSecrets(
  uid: string,
  profileMfa?: unknown
): Promise<TotpSecrets> {
  const secretRef = userSecretsRef(uid);
  const snapshot = await secretRef.get();
  const legacy = legacyTotpSecrets(profileMfa);

  if (snapshot.exists) {
    // A document written before the cutover can still carry a copy. Remove it
    // rather than leaving a readable secret behind.
    if (legacy) {
      await adminDb.collection("users").doc(uid).update(legacyDeletes());
    }
    return parseTotpSecrets(snapshot.data()?.totp);
  }

  if (!legacy) return {};

  await adminDb.runTransaction(async (transaction) => {
    const [currentSecret, currentProfile] = await Promise.all([
      transaction.get(secretRef),
      transaction.get(adminDb.collection("users").doc(uid)),
    ]);

    // Another request migrated or re-enrolled while this one was reading. Its
    // write wins; this transaction only clears the leftover copy.
    if (currentSecret.exists) {
      if (legacyTotpSecrets(currentProfile.data()?.mfa)) {
        transaction.update(
          adminDb.collection("users").doc(uid),
          legacyDeletes()
        );
      }
      return;
    }

    const freshLegacy = legacyTotpSecrets(currentProfile.data()?.mfa);
    if (!freshLegacy) return;

    transaction.set(secretRef, {
      totp: freshLegacy,
      updatedAt: FieldValue.serverTimestamp(),
    });
    transaction.update(adminDb.collection("users").doc(uid), legacyDeletes());
  });

  const migrated = await secretRef.get();
  return migrated.exists ? parseTotpSecrets(migrated.data()?.totp) : legacy;
}

