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

export type MfaMethod = "totp" | "backup" | "webauthn";

/** Methods whose proof is a short code verified by `verifyMfaProof`. */
export type CodeMfaMethod = Exclude<MfaMethod, "webauthn">;

export interface MfaProof {
  totp?: string | null;
  backup?: string | null;
}

/** Shape of the `users/{uid}` document fields this module cares about. */
export interface MfaProfile {
  mfa?: {
    preferredMethod?: "totp" | "webauthn";
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
    webauthn?: {
      enabled: boolean;
      credentials: {
        credentialID: string;
        publicKey: string;
        counter: number;
        transports: string[];
        name: string;
        createdAt: number;
        deviceType?: "singleDevice" | "multiDevice";
        backedUp?: boolean;
      }[];
      /**
       * Legacy records stored credential IDs without public keys, so they can
       * never be verified. Kept only so such accounts are still recognised as
       * MFA-enrolled instead of being asked to start from scratch.
       */
      credentialIds?: string[];
    };
  } | null;
}

export type MfaVerification =
  | { ok: true; method: CodeMfaMethod }
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

  if (hasWebAuthnCredential(mfa.webauthn)) {
    methods.push("webauthn");
  }

  return methods;
}

/**
 * Whether a WebAuthn credential can actually be used.
 *
 * A credential is only usable when both its ID and public key are stored — the
 * legacy `credentialIds`-only records cannot be verified, so they do not count.
 */
function hasWebAuthnCredential(
  webauthn: NonNullable<NonNullable<MfaProfile["mfa"]>["webauthn"]> | undefined
): boolean {
  if (!webauthn?.enabled) return false;

  return (webauthn.credentials ?? []).some(
    (credential) =>
      typeof (credential as { credentialID?: string }).credentialID === "string" &&
      typeof credential?.publicKey === "string"
  );
}

/**
 * Whether the account has *any* MFA configured, including WebAuthn.
 *
 * Legacy `credentialIds` records have no public key and cannot verify, but
 * they are still counted here so such an account is told MFA_REQUIRED instead
 * of being asked to enroll from scratch.
 */
export function hasAnyMfaMethod(profile: MfaProfile | null): boolean {
  if (availableMfaMethods(profile).length > 0) return true;

  const webauthn = profile?.mfa?.webauthn;

  return Boolean(
    webauthn?.enabled &&
      ((webauthn?.credentials?.length ?? 0) > 0 ||
        (webauthn?.credentialIds?.length ?? 0) > 0)
  );
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
