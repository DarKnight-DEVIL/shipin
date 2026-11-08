import { NextRequest, NextResponse } from "next/server";

import { adminDb } from "@/lib/firebaseAdmin";
import { requireAuthWithProfile } from "@/lib/auth";
import {
  buildRegistrationOptions,
  readStoredCredentials,
  type WebAuthnRecord,
} from "@/lib/webauthn";
import { withErrorHandler } from "@/utils/errors";

const NO_STORE = { "Cache-Control": "no-store" } as const;

/**
 * POST /api/auth/mfa/webauthn/register/start
 *r
 * Start WebAuthn registration (ceremony 1 of 2).
 * Returns a PublicKeyCredentialCreationOptions object for navigator.credentials.create().
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

  // Fetch full user profile for email/displayName and existing credentials
  const userSnapshot = await adminDb.collection("users").doc(auth.profile.uid).get();
  if (!userSnapshot.exists) {
    return NextResponse.json(
      { success: false, error: "User not found.", code: "USER_PROFILE_NOT_FOUND" },
      { status: 404, headers: NO_STORE }
    );
  }

  const userData = userSnapshot.data() as Record<string, unknown> | undefined;
  const storedEmail = typeof userData?.email === "string" ? userData.email : null;
  const email = storedEmail || auth.token.email || `${auth.profile.uid}@shipin.local`;
  const storedName = typeof userData?.displayName === "string" ? userData.displayName : null;
  const displayName = storedName || auth.token.name || email;
  const record = (userData?.mfa as { webauthn?: WebAuthnRecord } | undefined)?.webauthn ?? {};
  const existingCredentials = readStoredCredentials(record);

  const options = await buildRegistrationOptions({
    uid: auth.profile.uid,
    userName: email,
    displayName,
    excludeCredentials: existingCredentials,
  });

  // Store the challenge for verification (consumed in /complete). In the
  // simplewebauthn JSON format the challenge is already base64url-encoded.
  await userSnapshot.ref.update({
    "mfa.webauthn.pendingChallenge": options.challenge,
    "mfa.webauthn.pendingExpires": Date.now() + 5 * 60 * 1000,
  });

  return NextResponse.json(
    { success: true, options },
    { status: 200, headers: NO_STORE }
  );
});