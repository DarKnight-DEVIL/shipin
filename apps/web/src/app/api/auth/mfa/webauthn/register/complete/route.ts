import { NextRequest, NextResponse } from "next/server";

import { adminDb } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";
import { requireAuthWithProfile } from "@/lib/auth";
import {
  verifyRegistration,
  readStoredCredentials,
  type WebAuthnRecord,
} from "@/lib/webauthn";
import { withErrorHandler } from "@/utils/errors";

const NO_STORE = { "Cache-Control": "no-store" } as const;

/**
 * POST /api/auth/mfa/webauthn/register/complete
 *
 * Complete WebAuthn registration (ceremony 2 of 2).
 * Verifies the attestation using @simplewebauthn/server and stores the credential.
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
  const { credential, credentialName } = body as {
    credential?: unknown;
    credentialName?: string;
  };

  if (!credential || typeof credential !== "object") {
    return NextResponse.json(
      { success: false, error: "Invalid credential.", code: "INVALID_CREDENTIAL" },
      { status: 400, headers: NO_STORE }
    );
  }

  const userSnapshot = await adminDb.collection("users").doc(auth.profile.uid).get();
  if (!userSnapshot.exists) {
    return NextResponse.json(
      { success: false, error: "User not found.", code: "USER_PROFILE_NOT_FOUND" },
      { status: 404, headers: NO_STORE }
    );
  }

  const userData = userSnapshot.data() as Record<string, unknown> | undefined;
  const record = (userData?.mfa as { webauthn?: WebAuthnRecord } | undefined)?.webauthn ?? {};
  const storedChallenge = record.pendingChallenge;

  if (!storedChallenge || record.pendingExpires && Date.now() > record.pendingExpires) {
    return NextResponse.json(
      { success: false, error: "No pending WebAuthn registration or challenge expired. Start registration first.", code: "WEBAUTHN_CHALLENGE_EXPIRED" },
      { status: 400, headers: NO_STORE }
    );
  }

  const verification = await verifyRegistration({
    response: credential as never,
    expectedChallenge: storedChallenge,
  });

  if (!verification.verified) {
    return NextResponse.json(
      { success: false, error: "WebAuthn attestation verification failed.", code: "WEBAUTHN_VERIFICATION_FAILED" },
      { status: 400, headers: NO_STORE }
    );
  }

  const newCredential = verification.credential;
  const existingCredentials = readStoredCredentials(record);

  // Ensure no duplicate credential IDs
  const hasDuplicate = existingCredentials.some(
    (c) => c.credentialID === newCredential.credentialID
  );
  if (hasDuplicate) {
    return NextResponse.json(
      { success: false, error: "This security key is already registered.", code: "WEBAUTHN_CREDENTIAL_EXISTS" },
      { status: 400, headers: NO_STORE }
    );
  }

  const credentialNameFinal = credentialName && typeof credentialName === "string" ? credentialName : "Security Key";

  await userSnapshot.ref.update({
    "mfa.webauthn.credentials": [
      ...existingCredentials,
      { ...newCredential, name: credentialNameFinal },
    ],
    "mfa.webauthn.enabled": true,
    "mfa.webauthn.pendingChallenge": null,
    "mfa.webauthn.pendingExpires": null,
    "mfa.required": true,
    updatedAt: FieldValue.serverTimestamp(),
  });

  return NextResponse.json(
    {
      success: true,
      credential: {
        id: newCredential.credentialID,
        name: credentialNameFinal,
      },
      message: "Security key registered successfully.",
    },
    { status: 200, headers: NO_STORE }
  );
});