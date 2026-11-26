/**
 * MFA proof verification.
 *
 * One place that decides whether a set of credentials (TOTP code, backup code,
 * or a WebAuthn session) satisfies an account's configured MFA. Used by:
 *
 *   - `requireAdmin` (per-request `x-mfa-*` headers), and
 *   - `POST /api/auth/mfa/session` (mints an elevated session cookie).
 *
 * Deliberately pure: it never touches the database.
 *
 * SMS is intentionally absent. SMS is a Firebase Identity Platform second
 * factor: Google sends the code, verifies it, and only then mints an ID token
 * carrying `firebase.sign_in_second_factor`. There is no server-side SMS code
 * to compare, so the callers treat that claim as proof instead.
 */

import { verifyBackupCode, verifyTotp } from "./mfa";

export type MfaMethod = "totp" | "backup";

export interface MfaProof {
  totp?: string | null;
  backup?: string | null;
}

/** Shape of the `users/{uid}` document fields this module cares about. */
export interface MfaProfile {
  mfa?: {
    preferredMethod?: "totp";
    totp?: {
      enabled: boolean;
      secret: string;
      backupCodes: string[];
    };
    /** Legacy custom-SMS records. Never trusted; kept types-only for cleanup. */
    sms?: {
      enabled: boolean;
      phoneNumber: string;
      pendingCode?: string;
      pendingExpires?: number;
    };
  } | null;
}

export type MfaVerification =
  | { ok: true; method: MfaMethod }
  | { ok: false; reason: "NO_MFA_CONFIGURED" | "INVALID_CODE" };

/** Which methods the account can actually use right now. */
export function availableMfaMethods(profile: MfaProfile | null): MfaMethod[] {
  const methods: MfaMethod[] = [];
  const mfa = profile?.mfa ?? {};

  if (mfa.totp?.enabled && mfa.totp?.secret) {
    methods.push("totp");
  }

  // Backup codes are a TOTP-enrollment feature, so they are only offered
  // alongside TOTP.
  if (mfa.totp?.backupCodes?.length) {
    methods.push("backup");
  }

  return methods;
}

/**
 * Whether the account has any MFA configured.
 *
 * Security keys are no longer offered, and a record left behind by one is not a method:
 * an account that held only a passkey has nothing it can verify, so it is told to
 * enrol TOTP rather than sent to a form it cannot complete.
 */
export function hasAnyMfaMethod(profile: MfaProfile | null): boolean {
  return availableMfaMethods(profile).length > 0;
}

/**
 * Verify a proof against the account's MFA configuration.
 *
 * TOTP allows a +/-1 step window (90 seconds of clock drift).
 */
export function verifyMfaProof(
  profile: MfaProfile | null,
  proof: MfaProof
): MfaVerification {
  const mfa = profile?.mfa ?? {};

  const totpCode = proof.totp?.trim() || "";
  const backupCode = proof.backup?.trim() || "";

  if (totpCode && mfa.totp?.enabled && mfa.totp?.secret) {
    if (verifyTotp(mfa.totp.secret, totpCode, 1)) {
      return { ok: true, method: "totp" };
    }
  }

  if (backupCode && mfa.totp?.backupCodes?.length) {
    if (verifyBackupCode(backupCode, mfa.totp.backupCodes) !== -1) {
      return { ok: true, method: "backup" };
    }
  }

  if (!hasAnyMfaMethod(profile)) {
    return { ok: false, reason: "NO_MFA_CONFIGURED" };
  }

  return { ok: false, reason: "INVALID_CODE" };
}
