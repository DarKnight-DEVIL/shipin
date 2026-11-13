import { NextRequest, NextResponse } from "next/server";

import { adminDb } from "@/lib/firebaseAdmin";
import { requireAuthWithProfile } from "@/lib/auth";
import {
  buildAuthenticationOptions,
  isChallengeExpired,
  readStoredCredentials,
  verifyAssertion,
  type WebAuthnRecord,
} from "@/lib/webauthn";
import { withErrorHandler } from "@/utils/errors";

const NO_STORE = { "Cache-Control": "no-store" } as const;

/**
 * POST /api/auth/mfa/webauthn/verify
 *
 * Two-step ceremony:
 *  1. Client sends { verifyOnly: true, credential } → server verifies assertion
 *  2. Client sends { verifyOnly: false } → server returns challenge options
 *
 * The session endpoint (/api/auth/mfa/session) handles the actual elevation;
 * this route only owns the WebAuthn assertion verification.
 */
export const POST = withErrorHandler(async (request: NextRequest) => {
  const auth = await requireAuthWithProfile(request);
  if (auth instanceof NextResponse) return auth;

  if (auth.profile.role !== "admin") {
    return NextResponse.json(
      { success: false, error: "Administrator access required.", code: "ADMIN_ACCESS_REQUIRED" },
      { status: 403, headers: NO_STORE }
    );
  }

  const body = await request.json();
  const { verifyOnly, credential } = body as {
    verifyOnly?: boolean;
    credential?: unknown;
  };

  const userSnapshot = await adminDb.collection("users").doc(auth.profile.uid).get();
  if (!userSnapshot.exists) {
    return NextResponse.json(
      { success: false, error: "User not found.", code: "USER_PROFILE_NOT_FOUND" },
      { status: 404, headers: NO_STORE }
    );
  }

  const userData = userSnapshot.data() as Record<string, unknown> | undefined;
  const record = (userData?.mfa as { webauthn?: WebAuthnRecord } | undefined)?.webauthn ?? {};
  const credentials = readStoredCredentials(record);

  // Step 1: verify an assertion
  if (verifyOnly && credential) {
    if (credentials.length === 0) {
      return NextResponse.json(
        { success: false, error: "No security key is registered for this account.", code: "WEBAUTHN_NOT_CONFIGURED" },
        { status: 403, headers: NO_STORE }
      );
    }

    if (!record.pendingChallenge || isChallengeExpired(record.pendingExpires)) {
      return NextResponse.json(
        { success: false, error: "This sign-in attempt expired. Try again.", code: "WEBAUTHN_CHALLENGE_EXPIRED" },
        { status: 400, headers: NO_STORE }
      );
    }

    const cred = credential as { id?: string; rawId?: string; type?: string; response?: Record<string, unknown> };
    if (!cred?.id || cred.type !== "public-key" || !cred.response) {
      return NextResponse.json(
        { success: false, error: "Invalid credential.", code: "INVALID_CREDENTIAL" },
        { status: 400, headers: NO_STORE }
      );
    }

    const stored = credentials.find((c) => c.credentialID === cred.id);
    if (!stored) {
      return NextResponse.json(
        { success: false, error: "That security key is not registered for this account.", code: "WEBAUTHN_UNKNOWN_CREDENTIAL" },
        { status: 401, headers: NO_STORE }
      );
    }

    const result = await verifyAssertion({
      response: cred as never,
      expectedChallenge: record.pendingChallenge,
      credential: stored,
    });

    if (!result.verified) {
      return NextResponse.json(
        { success: false, error: "That security key could not be verified.", code: "WEBAUTHN_VERIFICATION_FAILED" },
        { status: 401, headers: NO_STORE }
      );
    }

    // Consume the challenge (single-use) and update the counter
    await userSnapshot.ref.update({
      "mfa.webauthn.pendingChallenge": null,
      "mfa.webauthn.pendingExpires": null,
      "mfa.webauthn.credentials": credentials.map((c) =>
        c.credentialID === stored.credentialID ? { ...c, counter: result.newCounter } : c
      ),
    });

    return NextResponse.json(
      { success: true, message: "WebAuthn verification successful." },
      { status: 200, headers: NO_STORE }
    );
  }

  // Step 2: return authentication options (challenge)
  const options = await buildAuthenticationOptions({
    allowCredentials: credentials,
  });

  // Store the challenge for verification. In the simplewebauthn JSON format
  // the challenge is already base64url-encoded.
  await adminDb.collection("users").doc(auth.profile.uid).update({
    "mfa.webauthn.pendingChallenge": options.challenge,
    "mfa.webauthn.pendingExpires": Date.now() + 5 * 60 * 1000,
  });

  return NextResponse.json(
    { success: true, options },
    { status: 200, headers: NO_STORE }
  );
});