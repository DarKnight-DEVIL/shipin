import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";

import { adminAuth, adminDb } from "@/lib/firebaseAdmin";
import {
  availableMfaMethods,
  verifyMfaProof,
  type MfaMethod,
} from "@/lib/mfaProof";
import {
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
} from "@/lib/mfaSession";
import { addRateLimitHeaders, isRateLimited, loginRateLimiter } from "@/lib/rateLimiter";
import { withErrorHandler } from "@/utils/errors";

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

  return { uid: decoded.uid, email: decoded.email, profile };
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

  const session = getMfaSession(request);
  const elevated = Boolean(session && session.uid === caller.uid);
  const methods = availableMfaMethods(caller.profile as never);

  return NextResponse.json(
    {
      success: true,
      elevated,
      expiresAt: elevated ? session!.expiresAt : null,
      methods,
      sessionTtlMs: MFA_SESSION_TTL_MS,
    },
    { status: 200, headers: NO_STORE }
  );
});

interface SessionRequestBody {
  method?: string;
  code?: string;
  /** present when method === "webauthn" */
  credential?: unknown;
}

/**
 * POST /api/auth/mfa/session
 *
 * Exchanges a valid MFA code for a short-lived elevated session cookie.
 * Rate limited: 6-digit codes are brute-forceable without a limit.
 */
export const POST = withErrorHandler(async (request: NextRequest) => {
  const limit = await loginRateLimiter.record(request);

  if (isRateLimited(limit)) {
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

  let body: SessionRequestBody;

  try {
    body = (await request.json()) as SessionRequestBody;
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: "Invalid request body.",
        code: "INVALID_REQUEST_BODY",
      },
      { status: 400, headers: NO_STORE }
    );
  }

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
    const stored = credentials.find((credential) => credential.credentialID === presented);

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

    const result = await verifyAssertion({
      response: assertion,
      expectedChallenge: record.pendingChallenge,
      credential: stored,
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
          ? { ...credential, counter: result.newCounter }
          : credential
      ),
      "mfa.webauthn.pendingChallenge": null,
      "mfa.webauthn.pendingExpires": null,
    });

    return elevatedResponse(caller.uid, "webauthn");
  }

  const code = typeof body.code === "string" ? body.code.trim() : "";
  const method: MfaMethod | undefined =
    body.method === "totp" || body.method === "backup" || body.method === "sms"
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
    sms: method === "sms" ? code : undefined,
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

  if (verification.consumeSmsChallenge) {
    // Single-use: delete the pending SMS challenge that was just accepted.
    await adminDb.collection("users").doc(caller.uid).update({
      "mfa.sms.pendingCode": FieldValue.delete(),
      "mfa.sms.pendingExpires": FieldValue.delete(),
    });
  }

  return elevatedResponse(caller.uid, verification.method);
});

/**
 * DELETE /api/auth/mfa/session
 *
 * Ends the elevated session (called on admin sign-out).
 */
export const DELETE = withErrorHandler(async () => {
  const response = NextResponse.json(
    { success: true, elevated: false },
    { status: 200, headers: NO_STORE }
  );

  response.headers.append("Set-Cookie", clearMfaSessionCookieHeader());

  return response;
});
