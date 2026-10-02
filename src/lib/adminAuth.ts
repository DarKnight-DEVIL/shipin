import { NextRequest } from "next/server";

import {
  adminAuth,
  adminDb,
} from "@/lib/firebaseAdmin";

export interface AdminUser {
  uid: string;
  email?: string;
  displayName?: string;
}

/**
 * Verifies that the incoming request belongs to
 * an authenticated ShipIN administrator.
 *
 * Authentication:
 * Firebase ID token
 *
 * Authorization:
 * users/{uid}.role === "admin"
 */
export async function requireAdmin(
  request: NextRequest
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
   * RETURN ADMIN
   * ========================================
   */

  return {
    uid,

    email:
      decodedToken.email ||
      userData?.email,

    displayName:
      decodedToken.name ||
      userData?.displayName,
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

  return {
    status: 500,
    error:
      "Unable to verify administrator access.",
  };
}