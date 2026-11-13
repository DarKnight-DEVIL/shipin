import { NextRequest, NextResponse } from "next/server";

import { adminDb } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";
import { requireAuthWithProfile } from "@/lib/auth";
import {
  generateTotpSecret,
  getTotpQrUrl,
  renderTotpQrDataUrl,
} from "@/lib/mfa";
import { withErrorHandler } from "@/utils/errors";

const NO_STORE = { "Cache-Control": "no-store" } as const;

const ISSUER = "ShipIN Admin";

/**
 * POST /api/auth/mfa/totp/setup
 *
 * Start authenticator-app enrollment for the signed-in admin: generate a fresh
 * secret and hand back everything the UI needs to display a QR code.
 *
 * The secret is stored with `enabled: false` so it cannot be used as a second
 * factor until the first code is confirmed at /api/auth/mfa/totp/verify.
 * Re-running this replaces the secret and so invalidates any previous
 * authenticator entry and existing backup codes.
 */
export const POST = withErrorHandler(async (request: NextRequest) => {
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

  const snapshot = await adminDb.collection("users").doc(auth.profile.uid).get();

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

  const userData = snapshot.data() ?? {};
  const email =
    typeof userData.email === "string" && userData.email
      ? userData.email
      : (auth.token.email ?? auth.profile.uid);

  const secret = generateTotpSecret();
  const qrUrl = getTotpQrUrl(secret, ISSUER, email);
  const qrDataUrl = await renderTotpQrDataUrl(qrUrl);

  await snapshot.ref.update({
    "mfa.totp": {
      secret,
      enabled: false,
      backupCodes: [],
    },
    "mfa.required": true,
    updatedAt: FieldValue.serverTimestamp(),
  });

  return NextResponse.json(
    {
      success: true,
      secret,
      qrUrl,
      qrDataUrl,
      message:
        "Scan the QR code, then confirm with the 6-digit code from your authenticator app.",
    },
    { status: 200, headers: NO_STORE }
  );
});
