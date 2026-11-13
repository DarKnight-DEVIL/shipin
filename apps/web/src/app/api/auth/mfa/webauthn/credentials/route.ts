import { NextRequest, NextResponse } from "next/server";

import { adminDb } from "@/lib/firebaseAdmin";
import { requireAuthWithProfile } from "@/lib/auth";
import { availableMfaMethods } from "@/lib/mfaProof";
import { readStoredCredentials, type WebAuthnRecord } from "@/lib/webauthn";
import { withErrorHandler } from "@/utils/errors";

export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "no-store" } as const;

/**
 * DELETE /api/auth/mfa/webauthn/credentials
 *
 * Removes one registered security key. Refuses to remove the account's last
 * second factor, so a mis-click cannot lock an admin out of the elevated area.
 */
export const DELETE = withErrorHandler(async (request: NextRequest) => {
  const auth = await requireAuthWithProfile(request);

  if (auth instanceof NextResponse) return auth;

  if (auth.profile.role !== "admin") {
    return NextResponse.json(
      {
        success: false,
        error: "Administrator access required.",
        code: "ADMIN_ACCESS_REQUIRED",
      },
      { status: 403, headers: NO_STORE }
    );
  }

  const body = await request.json().catch(() => null);
  const id = (body as { id?: unknown } | null)?.id;

  if (typeof id !== "string" || !id) {
    return NextResponse.json(
      {
        success: false,
        error: "A credential id is required.",
        code: "INVALID_CREDENTIAL",
      },
      { status: 400, headers: NO_STORE }
    );
  }

  const userRef = adminDb.collection("users").doc(auth.profile.uid);
  const snapshot = await userRef.get();

  if (!snapshot.exists) {
    return NextResponse.json(
      {
        success: false,
        error: "User not found.",
        code: "USER_PROFILE_NOT_FOUND",
      },
      { status: 404, headers: NO_STORE }
    );
  }

  const data = snapshot.data() ?? {};
  const record = (data.mfa?.webauthn ?? {}) as WebAuthnRecord;
  const credentials = readStoredCredentials(record);
  const remaining = credentials.filter((credential) => credential.credentialID !== id);

  if (remaining.length === credentials.length) {
    return NextResponse.json(
      {
        success: false,
        error: "That security key is not registered.",
        code: "WEBAUTHN_UNKNOWN_CREDENTIAL",
      },
      { status: 404, headers: NO_STORE }
    );
  }

  // Would any factor be left if this key goes?
  const otherMethods = availableMfaMethods({
    mfa: {
      totp: data.mfa?.totp,
      sms: data.mfa?.sms,
      webauthn:
        remaining.length > 0
          ? { enabled: true, credentials: remaining }
          : { enabled: false, credentials: [] },
    },
  }).filter((method) => method !== "webauthn");

  if (remaining.length === 0 && otherMethods.length === 0) {
    return NextResponse.json(
      {
        success: false,
        error:
          "This is your only second factor. Set up an authenticator app or SMS first.",
        code: "WEBAUTHN_LAST_FACTOR",
      },
      { status: 400, headers: NO_STORE }
    );
  }

  await userRef.update({
    "mfa.webauthn.credentials": remaining,
    "mfa.webauthn.enabled": remaining.length > 0,
    updatedAt: new Date(),
  });

  return NextResponse.json(
    { success: true, remaining: remaining.length },
    { status: 200, headers: NO_STORE }
  );
});
