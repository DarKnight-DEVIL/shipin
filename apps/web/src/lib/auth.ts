/**
 * Authentication helpers for ShipIN API routes.
 *
 * Uses centralized error handling via @/utils/errors for consistent
 * error responses across all API endpoints.
 */

import { NextResponse } from "next/server";
import type { DecodedIdToken } from "firebase-admin/auth";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";
import { getAdminAuthError, type AdminUser } from "./adminAuth";
import { getAccountBlock } from "./accountStatus";
import { verifyAppCheckRequest } from "./appCheck";
import { recordAppCheckRejection } from "./appCheckMetrics";
import { toShipINError, serializeError } from "@/utils/errors";

export interface VerifyIdTokenOptions {
  /**
   * Ask Firebase whether the user's refresh tokens were revoked (disable,
   * password reset, explicit revocation). Costs one user lookup per call, so
   * it is reserved for the administrator gate, which is where an immediate
   * ban matters most.
   */
  checkRevoked?: boolean;
}

export function extractAuth(request: Request): string | null {
  const authorization = request.headers.get("authorization");
  if (!authorization) return null;
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

/**
 * Remove values Firebase can echo back inside error text before it reaches
 * a log sink. Truncation alone is not sanitisation: an error such as
 * "no user record for jane@example.com" would still leak the address.
 */
export function redactPii(value: string): string {
  return value
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[email]")
    .replace(/\+?\d[\d\s().-]{7,}\d/g, "[phone]")
    .replace(/[\r\n]+/g, " ");
}

/** Verify a Firebase ID token. Invalid tokens return null rather than throwing. */
export async function verifyIdToken(
  token: string,
  options: VerifyIdTokenOptions = {}
): Promise<DecodedIdToken | null> {
  try {
    return await adminAuth.verifyIdToken(token, options.checkRevoked === true);
  } catch (error) {
    // Never log the raw error object — Firebase SDK errors can include
    // PII (user identifiers, phone numbers, etc.) in their messages.
    // Log only a safe, structured summary.
    console.error("[Auth] Token verification failed:", {
      errorCode: error instanceof Error ? error.name : "UNKNOWN",
      // Redact known PII shapes, then bound the length.
      message: redactPii(
        error instanceof Error ? error.message : String(error)
      ).slice(0, 200),
    });
    return null;
  }
}

function blockedResponse(code: string, message: string): NextResponse {
  return NextResponse.json(
    { success: false, error: message, code },
    { status: 403 }
  );
}

/**
 * App Check, bearer token and email verification — everything that can be
 * decided from the request and the token alone.
 *
 * Kept separate from the profile read so `requireAuthWithProfile` can apply the
 * account-state gate with a single Firestore read instead of two.
 */
async function verifyRequest(
  request: Request
): Promise<DecodedIdToken | NextResponse> {
  // Checked before the ID token when enforcement is on: an unverified client is
  // rejected without spending a token verification on it.
  const appCheck = await verifyAppCheckRequest(request);
  if (appCheck === "missing" || appCheck === "invalid") {
    // Counted for /api/health: a spike means clients cannot mint App Check
    // tokens at all (quota exhaustion or broken attestation), which is a
    // deployment-wide outage of the API surface, not one user's problem.
    recordAppCheckRejection(appCheck);
    return NextResponse.json(
      {
        success: false,
        error: "App verification failed. Reload the page and try again.",
        code: "APP_CHECK_FAILED",
      },
      { status: 401 }
    );
  }

  const token = extractAuth(request);
  if (!token) {
    return NextResponse.json(
      {
        success: false,
        error: "Authentication required.",
        code: "AUTHENTICATION_REQUIRED",
      },
      { status: 401 }
    );
  }

  const decoded = await verifyIdToken(token);
  if (!decoded) {
    return NextResponse.json(
      {
        success: false,
        error: "Invalid authentication token.",
        code: "INVALID_AUTHENTICATION",
      },
      { status: 401 }
    );
  }

  // Enforce email verification on all authenticated API access.
  if (decoded.email_verified !== true) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Please verify your email address before accessing this resource.",
        code: "EMAIL_VERIFICATION_REQUIRED",
      },
      { status: 403 }
    );
  }

  return decoded;
}

type AccountLookup =
  | { ok: true; profile: Record<string, unknown> | null }
  | { ok: false; response: NextResponse };

/**
 * Read users/{uid} and refuse the request when an administrator has disabled,
 * suspended, banned or deleted the account.
 *
 * The read is what makes those actions effective immediately: the Firebase ID
 * token keeps verifying for up to an hour after a ban, but this document does
 * not.
 */
async function loadAccount(uid: string): Promise<AccountLookup> {
  try {
    const snapshot = await adminDb.collection("users").doc(uid).get();
    const profile = snapshot.exists
      ? ((snapshot.data() ?? {}) as Record<string, unknown>)
      : null;
    const block = getAccountBlock(profile);

    if (block) {
      return {
        ok: false,
        response: blockedResponse(block.code, block.message),
      };
    }

    return { ok: true, profile };
  } catch (error) {
    console.error("[Auth] Account status check failed:", {
      errorCode: error instanceof Error ? error.name : "UNKNOWN",
    });
    return {
      ok: false,
      response: NextResponse.json(
        {
          success: false,
          error: "Unable to verify account status.",
          code: "INTERNAL_ERROR",
        },
        { status: 500 }
      ),
    };
  }
}

/**
 * Require any authenticated user with a verified email and an account that has
 * not been disabled, suspended, banned or deleted.
 *
 * Email verification is enforced server-side (#4) so that even if a client
 * bypasses the UI redirect, API routes reject unverified tokens.
 */
export async function requireAuth(
  request: Request
): Promise<DecodedIdToken | NextResponse> {
  const decoded = await verifyRequest(request);
  if (decoded instanceof NextResponse) return decoded;

  const account = await loadAccount(decoded.uid);
  if (!account.ok) return account.response;

  return decoded;
}

export async function requireAuthWithProfile(
  request: Request,
  allowedRoles?: Array<"admin" | "customer">
): Promise<
  | { token: DecodedIdToken; profile: { uid: string; role?: string } }
  | NextResponse
> {
  const decoded = await verifyRequest(request);
  if (decoded instanceof NextResponse) return decoded;

  const account = await loadAccount(decoded.uid);
  if (!account.ok) return account.response;

  if (!account.profile) {
    return NextResponse.json(
      {
        success: false,
        error: "User profile not found.",
        code: "USER_PROFILE_NOT_FOUND",
      },
      { status: 403 }
    );
  }

  const role =
    account.profile.role === "admin" || account.profile.role === "customer"
      ? account.profile.role
      : undefined;

  if (allowedRoles && !allowedRoles.includes(role ?? "customer")) {
    return NextResponse.json(
      {
        success: false,
        error: "Insufficient permissions.",
        code: "AUTHORIZATION_ERROR",
      },
      { status: 403 }
    );
  }

  return { token: decoded, profile: { uid: decoded.uid, role } };
}

export async function requireAdmin(
  request: Request
): Promise<AdminUser | NextResponse> {
  try {
    const adminAuthModule = await import("./adminAuth");
    return await adminAuthModule.requireAdmin(request);
  } catch (error) {
    const authError = getAdminAuthError(error);
    return NextResponse.json(
      {
        success: false,
        error: authError.error,
        code:
          authError.status === 401
            ? "AUTHENTICATION_REQUIRED"
            : "AUTHORIZATION_ERROR",
      },
      { status: authError.status }
    );
  }
}

export function handleAuthError(error: unknown): {
  status: number;
  body: { error: string };
} {
  const authError = getAdminAuthError(error);
  return { status: authError.status, body: { error: authError.error } };
}

/**
 * Wrap an auth handler with centralized error handling.
 */
export function withAuthHandler<
  T extends (...args: unknown[]) => Promise<NextResponse>,
>(handler: T): (...args: Parameters<T>) => Promise<NextResponse> {
  return async (...args: Parameters<T>): Promise<NextResponse> => {
    try {
      return await handler(...args);
    } catch (error) {
      const err = toShipINError(error);
      console.error("[Auth API Error]", err.code, err.message);
      return NextResponse.json(serializeError(error), { status: err.status });
    }
  };
}
