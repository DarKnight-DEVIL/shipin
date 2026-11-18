import "server-only";

import { adminAuth, adminDb } from "@/lib/firebaseAdmin";
import { verifyTotp, verifyBackupCode } from "@/lib/mfa";
import { getMfaSession } from "@/lib/mfaSession";
import { getAccountBlock } from "@/lib/accountStatus";
import { verifyAppCheckRequest } from "@/lib/appCheck";

/** A syntactically valid base32 secret that no administrator has enrolled. */
const TIMING_DECOY_TOTP_SECRET = "JBSWY3DPEHPK3PXP";

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
 * - A verified Identity Platform second factor (SMS), proven by the
 *   firebase.sign_in_second_factor claim on the ID token
 *
 * - A verified elevated MFA session cookie (issued by
 *   POST /api/auth/mfa/session after full challenge verification, including
 *   WebAuthn signature and counter checks)
 *
 * X-MFA-WebAuthn is accepted by the setup/verify API routes but is NOT
 * honored by this gate: the header alone proves nothing. The verified
 * session cookie above is the supported path for security keys.
 */
export async function requireAdmin(request: Request): Promise<AdminUser> {
  /*
   * ========================================
   * APP CHECK
   * ========================================
   * Checked before the ID token, exactly like the customer gate in
   * `lib/auth.ts`: with enforcement on, a stolen admin bearer token replayed by
   * a script that cannot mint an App Check token is rejected here, before it
   * costs a token verification. Off by default, so tests and local runs are
   * unaffected.
   */

  const appCheck = await verifyAppCheckRequest(request);

  if (appCheck === "missing" || appCheck === "invalid") {
    throw new Error("APP_CHECK_FAILED");
  }

  /*
   * ========================================
   * GET AUTHORIZATION HEADER
   * ========================================
   */

  const authorization = request.headers.get("authorization");

  if (!authorization?.startsWith("Bearer ")) {
    throw new Error("AUTHENTICATION_REQUIRED");
  }

  const idToken = authorization.substring(7);

  if (!idToken) {
    throw new Error("AUTHENTICATION_REQUIRED");
  }

  /*
   * ========================================
   * VERIFY FIREBASE ID TOKEN
   * ========================================
   */

  let decodedToken;

  try {
    /*
     * checkRevoked: the administrator gate pays for one extra user lookup so
     * a revoked, disabled or deleted Firebase account stops working on its
     * next request instead of when the current ID token expires (up to 1h).
     * Customer routes skip this — their account state is read from Firestore
     * instead, which costs nothing extra.
     */
    decodedToken = await adminAuth.verifyIdToken(idToken, true);
  } catch (error) {
    console.error("Admin authentication failed:", error);

    throw new Error("INVALID_AUTHENTICATION");
  }

  /*
   * ========================================
   * VERIFIED EMAIL
   * ========================================
   * Customer routes already refuse unverified addresses; the administrator gate
   * did not, so an unverified account with the role could use the console.
   */

  if (decodedToken.email_verified !== true) {
    throw new Error("EMAIL_VERIFICATION_REQUIRED");
  }

  const uid = decodedToken.uid;

  /*
   * ========================================
   * GET USER PROFILE
   * ========================================
   */

  const userSnapshot = await adminDb.collection("users").doc(uid).get();

  if (!userSnapshot.exists) {
    throw new Error("USER_PROFILE_NOT_FOUND");
  }

  const userData = userSnapshot.data();

  /*
   * ========================================
   * ACCOUNT STATE CHECK
   * ========================================
   * A banned, suspended, disabled or deleted administrator must lose the
   * console even while their ID token still verifies. The flags live on the
   * profile (only an admin can write them — firestore.rules blocks self-writes).
   */

  const accountBlock = getAccountBlock(userData);

  if (accountBlock) {
    throw new Error(accountBlock.code);
  }

  /*
   * ========================================
   * ADMIN ROLE CHECK
   * ========================================
   */

  if (userData?.role !== "admin") {
    throw new Error("ADMIN_ACCESS_REQUIRED");
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
  const hasWebAuthn =
    mfa.webauthn?.enabled && (mfa.webauthn.credentialIds?.length ?? 0) > 0;
  // Firebase (Identity Platform) second factors — SMS today — live on the
  // Auth user, not in Firestore. A token that completed the challenge carries
  // `firebase.sign_in_second_factor`, so it is proof in itself.
  const secondFactorVerified = Boolean(
    (decodedToken as { firebase?: { sign_in_second_factor?: string } }).firebase
      ?.sign_in_second_factor
  );

  let hasAnyMfa = hasTotp || hasWebAuthn || secondFactorVerified;

  if (!hasAnyMfa) {
    // Nothing in Firestore: ask Auth whether a Firebase-managed factor exists,
    // so an SMS-only admin is not told to start over.
    try {
      const authUser = await adminAuth.getUser(uid);
      hasAnyMfa = (authUser.multiFactor?.enrolledFactors?.length ?? 0) > 0;
    } catch {
      // A failed lookup means no factor: fall through to MFA_SETUP_REQUIRED
      // rather than granting access.
    }
  }

  // Check for MFA headers
  const totpCode = request.headers.get("x-mfa-totp");
  const backupCode = request.headers.get("x-mfa-backup");

  let mfaVerified = secondFactorVerified;

  // TOTP verification.
  //
  // The verification runs whenever a code is supplied, against a decoy secret
  // when TOTP is not enrolled: otherwise the response time itself tells an
  // attacker whether an administrator has TOTP configured. The decoy secret can
  // never grant access — the result is only honoured when hasTotp is true.
  if (totpCode) {
    const secret = hasTotp ? mfa.totp.secret : TIMING_DECOY_TOTP_SECRET;

    if (hasTotp && verifyTotp(secret, totpCode, 1)) {
      mfaVerified = true;
    } else {
      verifyTotp(secret, totpCode, 1);
    }
  }

  // Backup code verification
  if (!mfaVerified && backupCode && mfa.totp?.backupCodes?.length) {
    const index = verifyBackupCode(backupCode, mfa.totp.backupCodes);
    if (index !== -1) {
      mfaVerified = true;
    }
  }

  // WebAuthn verification is intentionally NOT supported at the API-gate
  // layer: a raw X-MFA-WebAuthn header proves nothing without a per-request
  // challenge, signature verification against the stored public key, and a
  // counter check. Those checks already happen in POST /api/auth/mfa/session,
  // which issues a short-lived signed session bound to the uid. Honoring that
  // session here is what lets security-key-only admins through instead of
  // locking them out.
  if (!mfaVerified) {
    const session = await getMfaSession(request);

    if (session && session.uid === uid) {
      mfaVerified = true;
    }
  }

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
    email: decodedToken.email || userData?.email,
    displayName: decodedToken.name || userData?.displayName,
    mfaVerified: true,
  };
}

/**
 * Converts admin authorization errors
 * into the appropriate HTTP response.
 */
export function getAdminAuthError(error: unknown) {
  const message = error instanceof Error ? error.message : "";

  if (message === "AUTHENTICATION_REQUIRED") {
    return {
      status: 401,
      error: "Authentication required.",
    };
  }

  if (message === "INVALID_AUTHENTICATION") {
    return {
      status: 401,
      error: "Invalid authentication.",
    };
  }

  if (message === "USER_PROFILE_NOT_FOUND") {
    return {
      status: 403,
      error: "User profile not found.",
    };
  }

  if (message === "ADMIN_ACCESS_REQUIRED") {
    return {
      status: 403,
      error: "Administrator access required.",
    };
  }

  if (message === "MFA_REQUIRED") {
    return {
      status: 401,
      error:
        "Multi-factor authentication required. Provide a TOTP code, a backup code, or sign in again so Identity Platform completes your SMS second factor.",
    };
  }

  if (
    message === "ACCOUNT_DELETED" ||
    message === "ACCOUNT_BANNED" ||
    message === "ACCOUNT_SUSPENDED" ||
    message === "ACCOUNT_DISABLED"
  ) {
    return {
      status: 403,
      error:
        "This account is no longer allowed to access the administrator console.",
    };
  }

  if (message === "APP_CHECK_FAILED") {
    return {
      status: 401,
      error: "App verification failed. Reload the page and try again.",
    };
  }

  if (message === "EMAIL_VERIFICATION_REQUIRED") {
    return {
      status: 403,
      error: "Please verify your email address before accessing this resource.",
    };
  }

  if (message === "MFA_SETUP_REQUIRED") {
    return {
      status: 403,
      error:
        "Multi-factor authentication is required for administrator accounts. Set up TOTP, WebAuthn, or SMS MFA before accessing admin routes.",
    };
  }

  return {
    status: 500,
    error: "Unable to verify administrator access.",
  };
}
