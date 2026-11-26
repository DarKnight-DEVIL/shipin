import { NextRequest, NextResponse } from "next/server";

import { adminAuth, adminDb } from "@/lib/firebaseAdmin";
import {
  availableMfaMethods,
  verifyMfaProof,
  type MfaMethod,
} from "@/lib/mfaProof";
import {
  credentialUsableHere,
  getWebAuthnConfig,
  isChallengeExpired,
  readStoredCredentials,
  verifyAssertion,
  type WebAuthnRecord,
} from "@/lib/webauthn";
import {
  MFA_SESSION_TTL_MS,
  clearMfaSessionCookieHeader,
  createMfaSessionCookieHeader,
  createMfaSessionToken,
  getMfaSession,
  revokeMfaSession,
} from "@/lib/mfaSession";
import {
  addRateLimitHeaders,
  isRateLimited,
  loginRateLimiter,
} from "@/lib/rateLimiter";
import { verifyAppCheckRequest } from "@/lib/appCheck";
import { withErrorHandler } from "@/utils/errors";
import { mfaSessionBodySchema, readAndValidateBody } from "@/lib/validation";

const NO_STORE = { "Cache-Control": "no-store" } as const;

/** Shape of an AuthenticationResponseJSON we are willing to verify. */
function readAssertion(value: unknown) {
  if (!value || typeof value !== "object") return null;

  const assertion = value as Record<string, unknown>;

  const valid =
    typeof assertion.id === "string" &&
    typeof assertion.rawId === "string" &&
    assertion.type === "public-key" &&
    typeof assertion.response === "object" &&
    assertion.response !== null;

  return valid ? (value as never) : null;
}

/** Build the elevated-session response shared by every MFA method. */
function elevatedResponse(uid: string, method: MfaMethod) {
  const { token, expiresAt } = createMfaSessionToken(uid);

  const response = NextResponse.json(
    {
      success: true,
      elevated: true,
      method,
      expiresAt,
      sessionTtlMs: MFA_SESSION_TTL_MS,
    },
    { status: 200, headers: NO_STORE }
  );

  response.headers.append("Set-Cookie", createMfaSessionCookieHeader(token));

  return response;
}

interface CallerContext {
  uid: string;
  email?: string;
  profile: Record<string, unknown> | undefined;
  /** True when Firebase already completed a second factor for this token. */
  secondFactorVerified: boolean;
}

/**
 * Resolve the Firebase ID token on the request to an admin profile.
 * Returns a NextResponse on failure so handlers can `return` it directly.
 */
async function resolveAdminCaller(
  request: NextRequest
): Promise<CallerContext | NextResponse> {
  const authorization = request.headers.get("authorization");

  if (!authorization?.startsWith("Bearer ")) {
    return NextResponse.json(
      {
        success: false,
        error: "Authentication required.",
        code: "AUTHENTICATION_REQUIRED",
      },
      { status: 401, headers: NO_STORE }
    );
  }

  const token = authorization.slice("Bearer ".length).trim();

  // This route mints the elevated admin session, so it is the one MFA endpoint
  // that does not go through `requireAuthWithProfile` and therefore has to run
  // the App Check gate itself.
  const appCheck = await verifyAppCheckRequest(request);
  if (appCheck === "missing" || appCheck === "invalid") {
    return NextResponse.json(
      {
        success: false,
        error: "App verification failed. Reload the page and try again.",
        code: "APP_CHECK_FAILED",
      },
      { status: 401, headers: NO_STORE }
    );
  }

  let decoded;

  try {
    decoded = await adminAuth.verifyIdToken(token);
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: "Invalid authentication token.",
        code: "INVALID_AUTHENTICATION",
      },
      { status: 401, headers: NO_STORE }
    );
  }

  if (decoded.email_verified !== true) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Please verify your email address before accessing this resource.",
        code: "EMAIL_VERIFICATION_REQUIRED",
      },
      { status: 403, headers: NO_STORE }
    );
  }

  const snapshot = await adminDb.collection("users").doc(decoded.uid).get();

  if (!snapshot.exists) {
    return NextResponse.json(
      {
        success: false,
        error: "User profile not found.",
        code: "USER_PROFILE_NOT_FOUND",
      },
      { status: 403, headers: NO_STORE }
    );
  }

  const profile = snapshot.data() as Record<string, unknown> | undefined;

  if (profile?.role !== "admin") {
    return NextResponse.json(
      {
        success: false,
        error: "Administrator access required.",
        code: "ADMIN_ACCESS_REQUIRED",
      },
      { status: 403, headers: NO_STORE }
    );
  }

  const secondFactorVerified = Boolean(
    (decoded as { firebase?: { sign_in_second_factor?: string } }).firebase
      ?.sign_in_second_factor
  );

  return {
    uid: decoded.uid,
    email: decoded.email,
    profile,
    secondFactorVerified,
  };
}

/**
 * GET /api/auth/mfa/session
 *
 * Reports whether the caller currently holds an elevated MFA session, and
 * which MFA methods their account can use. Safe to poll from the admin UI.
 */
export const GET = withErrorHandler(async (request: NextRequest) => {
  const caller = await resolveAdminCaller(request);

  if (caller instanceof NextResponse) return caller;

  const session = await getMfaSession(request);
  const elevated = Boolean(
    caller.secondFactorVerified || (session && session.uid === caller.uid)
  );
  const methods = availableMfaMethods(caller.profile as never);

  return NextResponse.json(
    {
      success: true,
      elevated,
      expiresAt:
        session && session.uid === caller.uid ? session.expiresAt : null,
      methods,
      sessionTtlMs: MFA_SESSION_TTL_MS,
    },
    { status: 200, headers: NO_STORE }
  );
});

/**
 * POST /api/auth/mfa/session
 *
 * Exchanges a valid MFA code for a short-lived elevated session cookie.
 * Rate limited: 6-digit codes are brute-forceable without a limit.
 */
export const POST = withErrorHandler(async (request: NextRequest) => {
  const limit = await loginRateLimiter.record(request);

  // Infrastructure failure, not abuse — the rule the proxy and login-intent
  // apply. Failing closed here answered 429 for every elevation on a
  // store-less deployment (which is every local E2E run).
  if (isRateLimited(limit) && !limit.unavailable) {
    const response = NextResponse.json(
      {
        success: false,
        error: "Too many verification attempts. Please wait and try again.",
        code: "RATE_LIMIT_ERROR",
      },
      { status: 429, headers: NO_STORE }
    );

    addRateLimitHeaders(response.headers, limit);
    return response;
  }

  const caller = await resolveAdminCaller(request);

  if (caller instanceof NextResponse) return caller;

  const parsed = await readAndValidateBody(request, mfaSessionBodySchema);

  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,
        error: "Invalid request body.",
        code: "INVALID_REQUEST_BODY",
      },
      { status: 400, headers: NO_STORE }
    );
  }

  const body = parsed.data;

  if (body.method === "webauthn") {
    const assertion = readAssertion(body.credential);

    if (!assertion) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid security key response.",
          code: "WEBAUTHN_INVALID_RESPONSE",
        },
        { status: 400, headers: NO_STORE }
      );
    }

    const userRef = adminDb.collection("users").doc(caller.uid);
    const record =
      (caller.profile as { mfa?: { webauthn?: WebAuthnRecord } } | undefined)
        ?.mfa?.webauthn ?? {};
    const credentials = readStoredCredentials(record);

    if (credentials.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: "No security key is registered for this account.",
          code: "MFA_SETUP_REQUIRED",
        },
        { status: 403, headers: NO_STORE }
      );
    }

    if (!record.pendingChallenge || isChallengeExpired(record.pendingExpires)) {
      return NextResponse.json(
        {
          success: false,
          error: "This sign-in attempt expired. Try again.",
          code: "WEBAUTHN_CHALLENGE_EXPIRED",
        },
        { status: 400, headers: NO_STORE }
      );
    }

    const presented = (assertion as { id: string }).id;
    const stored = credentials.find(
      (credential) => credential.credentialID === presented
    );

    // The challenge is single-use no matter how verification goes.
    const clearChallenge = () =>
      userRef.update({
        "mfa.webauthn.pendingChallenge": null,
        "mfa.webauthn.pendingExpires": null,
      });

    if (!stored) {
      await clearChallenge();

      return NextResponse.json(
        {
          success: false,
          error: "That security key is not registered for this account.",
          code: "WEBAUTHN_UNKNOWN_CREDENTIAL",
        },
        { status: 401, headers: NO_STORE }
      );
    }

    /*
     * A credential is bound to the RP ID it was enrolled for. After a move to another
     * domain the stored key is still listed but can never verify here, and the library
     * would answer only "could not be verified" - true and useless. The tag makes it a
     * sentence the customer can act on.
     */
    const { rpID } = getWebAuthnConfig(request.nextUrl.origin);

    if (!credentialUsableHere(stored, rpID)) {
      await clearChallenge();

      return NextResponse.json(
        {
          success: false,
          error: `This key was registered for ${stored.rpID}, which this site no longer uses. Register it again to use it here.`,
          code: "WEBAUTHN_RP_MISMATCH",
        },
        { status: 401, headers: NO_STORE }
      );
    }

    const result = await verifyAssertion({
      response: assertion,
      expectedChallenge: record.pendingChallenge,
      credential: stored,
      // Same origin rule as the verify route: the ceremony is bound to the
      // origin that served the page, which is not necessarily APP_URL in dev.
      requestOrigin: request.nextUrl.origin,
    });

    if (!result.verified) {
      await clearChallenge();

      return NextResponse.json(
        {
          success: false,
          error: "That security key could not be verified.",
          code: "MFA_INVALID_CODE",
        },
        { status: 401, headers: NO_STORE }
      );
    }

    await userRef.update({
      "mfa.webauthn.credentials": credentials.map((credential) =>
        credential.credentialID === stored.credentialID
          ? // Re-stamped on use, so a credential enrolled before the tag existed is
            // labelled from the first successful sign-in instead of staying ambiguous.
            { ...credential, counter: result.newCounter, rpID }
          : credential
      ),
      "mfa.webauthn.pendingChallenge": null,
      "mfa.webauthn.pendingExpires": null,
    });

    return elevatedResponse(caller.uid, "webauthn");
  }

  const code = typeof body.code === "string" ? body.code.trim() : "";
  const method: MfaMethod | undefined =
    body.method === "totp" || body.method === "backup"
      ? body.method
      : undefined;

  if (!code) {
    return NextResponse.json(
      {
        success: false,
        error: "A verification code is required.",
        code: "MFA_CODE_REQUIRED",
      },
      { status: 400, headers: NO_STORE }
    );
  }

  const verification = verifyMfaProof(caller.profile as never, {
    totp: method === "totp" ? code : undefined,
    backup: method === "backup" ? code : undefined,
  });

  if (!verification.ok) {
    if (verification.reason === "NO_MFA_CONFIGURED") {
      return NextResponse.json(
        {
          success: false,
          error:
            "No multi-factor method is configured for this account. Set one up before continuing.",
          code: "MFA_SETUP_REQUIRED",
        },
        { status: 403, headers: NO_STORE }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: "That verification code is not valid.",
        code: "MFA_INVALID_CODE",
      },
      { status: 401, headers: NO_STORE }
    );
  }

  return elevatedResponse(caller.uid, verification.method);
});

/**
 * DELETE /api/auth/mfa/session
 *
 * Ends the elevated session (called on admin sign-out).
 *
 * A valid ID token is required. This is the only endpoint that clears the
 * elevation cookie, and an unauthenticated caller should not be able to end
 * someone else's session or use the route as a free cookie-setting primitive.
 * The admin role is deliberately *not* required: an account whose role was just
 * revoked must still be able to drop its own elevation, and with a non-admin
 * role the cookie is useless anyway — `requireAdmin` re-reads the role on every
 * request.
 */
export const DELETE = withErrorHandler(async (request: NextRequest) => {
  const appCheck = await verifyAppCheckRequest(request);
  if (appCheck === "missing" || appCheck === "invalid") {
    return NextResponse.json(
      {
        success: false,
        error: "App verification failed. Reload the page and try again.",
        code: "APP_CHECK_FAILED",
      },
      { status: 401, headers: NO_STORE }
    );
  }

  const authorization = request.headers.get("authorization");

  if (!authorization?.startsWith("Bearer ")) {
    return NextResponse.json(
      {
        success: false,
        error: "Authentication required.",
        code: "AUTHENTICATION_REQUIRED",
      },
      { status: 401, headers: NO_STORE }
    );
  }

  const token = authorization.slice("Bearer ".length).trim();

  try {
    await adminAuth.verifyIdToken(token);
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: "Invalid authentication token.",
        code: "INVALID_AUTHENTICATION",
      },
      { status: 401, headers: NO_STORE }
    );
  }

  // Revoke server-side as well as clearing the browser copy: the cookie is
  // only one holder of this session, and a token copied out of an earlier
  // request would keep verifying for its full lifetime otherwise.
  const session = await getMfaSession(request);

  if (session) await revokeMfaSession(session);

  const response = NextResponse.json(
    { success: true, elevated: false },
    { status: 200, headers: NO_STORE }
  );

  response.headers.append("Set-Cookie", clearMfaSessionCookieHeader());

  return response;
});
