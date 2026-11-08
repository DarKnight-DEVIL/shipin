import {
  adminAuth,
  adminDb,
} from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";
import { verifyTotp, verifyBackupCode, hashSmsCode } from "@/lib/mfa";

export interface AdminUser {
  uid: string;
  email?: string;
  displayName?: string;
  mfaVerified?: boolean;
}

/**
 * Verifies that the incoming request belongs to
 * an authenticated ShipIN administrator with MFA.
 *
 * Authentication:
 * Firebase ID token
 *
 * Authorization:
 * users/{uid}.role === "admin"
 *
 * MFA:
 * MFA is mandatory for admin routes. Requires one of:
 * - TOTP code in X-MFA-TOTP header
 * - Backup code in X-MFA-Backup header
 * - SMS code in X-MFA-SMS header (must match a pending challenge issued
 *   via POST /api/auth/mfa/sms/setup, unexpired, single-use)
 *
 * X-MFA-WebAuthn is accepted by the setup/verify API routes but is NOT
 * honored by this gate until full challenge/response verification ships
 * (see the WebAuthn note below in the MFA enforcement section).
 */
export async function requireAdmin(
  request: Request
): Promise<AdminUser> {
  /*
   * ========================================
   * GET AUTHORIZATION HEADER
   * ========================================
   */

  const authorization =
    request.headers.get("authorization");

  if (
    !authorization?.startsWith(
      "Bearer "
    )
  ) {
    throw new Error(
      "AUTHENTICATION_REQUIRED"
    );
  }

  const idToken =
    authorization.substring(7);

  if (!idToken) {
    throw new Error(
      "AUTHENTICATION_REQUIRED"
    );
  }

  /*
   * ========================================
   * VERIFY FIREBASE ID TOKEN
   * ========================================
   */

  let decodedToken;

  try {
    decodedToken =
      await adminAuth.verifyIdToken(
        idToken
      );
  } catch (error) {
    console.error(
      "Admin authentication failed:",
      error
    );

    throw new Error(
      "INVALID_AUTHENTICATION"
    );
  }

  const uid =
    decodedToken.uid;

  /*
   * ========================================
   * GET USER PROFILE
   * ========================================
   */

  const userSnapshot =
    await adminDb
      .collection("users")
      .doc(uid)
      .get();

  if (!userSnapshot.exists) {
    throw new Error(
      "USER_PROFILE_NOT_FOUND"
    );
  }

  const userData =
    userSnapshot.data();

  /*
   * ========================================
   * ADMIN ROLE CHECK
   * ========================================
   */

  if (
    userData?.role !== "admin"
  ) {
    throw new Error(
      "ADMIN_ACCESS_REQUIRED"
    );
  }

  /*
   * ========================================
   * MFA ENFORCEMENT
   * ========================================
   *
   * MFA is MANDATORY for all administrator accounts. An admin without
   * any enabled MFA method must complete setup before they can access
   * admin routes (they get MFA_SETUP_REQUIRED instead of MFA_REQUIRED).
   */

  const mfa = userData?.mfa || {};
  const hasTotp = mfa.totp?.enabled && mfa.totp?.secret;
  const hasWebAuthn = mfa.webauthn?.enabled && (mfa.webauthn.credentialIds?.length ?? 0) > 0;
  const hasSms = mfa.sms?.enabled && mfa.sms?.phoneNumber;
  const hasAnyMfa = hasTotp || hasWebAuthn || hasSms;

  // Check for MFA headers
  const totpCode = request.headers.get("x-mfa-totp");
  const backupCode = request.headers.get("x-mfa-backup");
  const smsCode = request.headers.get("x-mfa-sms");

  let mfaVerified = false;

  // TOTP verification
  if (totpCode && hasTotp) {
    if (verifyTotp(mfa.totp.secret, totpCode, 1)) {
      mfaVerified = true;
    }
  }

  // Backup code verification
  if (!mfaVerified && backupCode && mfa.totp?.backupCodes?.length) {
    const index = verifyBackupCode(backupCode, mfa.totp.backupCodes);
    if (index !== -1) {
      mfaVerified = true;
    }
  }

  // SMS verification — challenge-based: the code must match a pending
  // challenge issued via /api/auth/mfa/sms/setup, still unexpired, and
  // it is consumed on use (single-use, prevents replay).
  if (!mfaVerified && smsCode && hasSms) {
    const pendingCode = mfa.sms?.pendingCode;
    const pendingExpires = mfa.sms?.pendingExpires;

    if (typeof smsCode === "string" && /^\d{6}$/.test(smsCode)
      && pendingCode && pendingExpires) {
      const isExpired = Date.now() > pendingExpires;
      const matches = hashSmsCode(smsCode) === pendingCode;

      if (matches && !isExpired) {
        // Consume the challenge so it cannot be reused.
        await adminDb.collection("users").doc(uid).update({
          "mfa.sms.pendingCode": FieldValue.delete(),
          "mfa.sms.pendingExpires": FieldValue.delete(),
        });
        mfaVerified = true;
      }
    }
  }

  // WebAuthn verification is intentionally NOT supported at the API-gate
  // layer: a secure implementation requires a per-request challenge
  // (issued by /api/auth/mfa/webauthn/verify), signature verification
  // against the stored public key, and a signature-counter check.
  // Until that flow is complete, an X-MFA-WebAuthn header is ignored
  // (fail closed) rather than silently accepted.

  if (!mfaVerified) {
    // No valid MFA provided. If the admin has NO MFA methods configured at all,
    // they must set one up before they can proceed.
    if (!hasAnyMfa) {
      throw new Error("MFA_SETUP_REQUIRED");
    }
    throw new Error("MFA_REQUIRED");
  }

  return {
    uid,
    email:
      decodedToken.email ||
      userData?.email,
    displayName:
      decodedToken.name ||
      userData?.displayName,
    mfaVerified: true,
  };
}

/**
 * Converts admin authorization errors
 * into the appropriate HTTP response.
 */
export function getAdminAuthError(
  error: unknown
) {
  const message =
    error instanceof Error
      ? error.message
      : "";

  if (
    message ===
    "AUTHENTICATION_REQUIRED"
  ) {
    return {
      status: 401,
      error:
        "Authentication required.",
    };
  }

  if (
    message ===
    "INVALID_AUTHENTICATION"
  ) {
    return {
      status: 401,
      error:
        "Invalid authentication.",
    };
  }

  if (
    message ===
    "USER_PROFILE_NOT_FOUND"
  ) {
    return {
      status: 403,
      error:
        "User profile not found.",
    };
  }

  if (
    message ===
    "ADMIN_ACCESS_REQUIRED"
  ) {
    return {
      status: 403,
      error:
        "Administrator access required.",
    };
  }

  if (
    message ===
    "MFA_REQUIRED"
  ) {
    return {
      status: 401,
      error:
        "Multi-factor authentication required. Provide one of: X-MFA-TOTP, X-MFA-Backup, or X-MFA-SMS (a code issued via the SMS MFA setup flow).",
    };
  }

  if (
    message ===
    "MFA_SETUP_REQUIRED"
  ) {
    return {
      status: 403,
      error:
        "Multi-factor authentication is required for administrator accounts. Set up TOTP, WebAuthn, or SMS MFA before accessing admin routes.",
    };
  }

  return {
    status: 500,
    error:
      "Unable to verify administrator access.",
  };
}