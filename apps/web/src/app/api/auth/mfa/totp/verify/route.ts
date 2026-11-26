import { NextRequest, NextResponse } from "next/server";

import { adminDb } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";
import { requireAuthWithProfile } from "@/lib/auth";
import { generateBackupCodes, hashBackupCode, verifyTotp } from "@/lib/mfa";
import { withErrorHandler } from "@/utils/errors";
import { readAndValidateBody, verifyTotpBodySchema } from "@/lib/validation";
import { loadTotpSecrets, userSecretsRef } from "@/lib/mfaSecrets";

const NO_STORE = { "Cache-Control": "no-store" } as const;

const BACKUP_CODE_COUNT = 10;

/**
 * POST /api/auth/mfa/totp/verify
 *
 * Confirm authenticator enrollment with the first 6-digit code. On success TOTP
 * becomes an active factor and ten fresh backup codes are issued — returned in
 * plaintext exactly once, stored only as SHA-256 hashes.
 */
export const POST = withErrorHandler(async (request: NextRequest) => {
  const auth = await requireAuthWithProfile(request);

  if (auth instanceof NextResponse) return auth;

  const parsed = await readAndValidateBody(request, verifyTotpBodySchema);

  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,
        error:
          parsed.reason === "parse"
            ? "Invalid request body."
            : "Enter the 6-digit code from your authenticator app.",
        code:
          parsed.reason === "parse"
            ? "INVALID_REQUEST_BODY"
            : "INVALID_TOTP_CODE",
      },
      { status: 400, headers: NO_STORE }
    );
  }

  const code = parsed.data.code;

  const snapshot = await adminDb
    .collection("users")
    .doc(auth.profile.uid)
    .get();

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

  const secrets = await loadTotpSecrets(auth.profile.uid, snapshot.data()?.mfa);
  const secret = secrets.secret ?? null;

  if (!secret) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Authenticator setup was not started. Start it again to get a new secret.",
        code: "TOTP_NOT_SETUP",
      },
      { status: 400, headers: NO_STORE }
    );
  }

  // ±1 step (30s) tolerance covers clock drift between server and phone.
  if (!verifyTotp(secret, code, 1)) {
    return NextResponse.json(
      {
        success: false,
        error:
          "That code is not valid. Check your authenticator app and try again.",
        code: "INVALID_TOTP_CODE",
      },
      { status: 400, headers: NO_STORE }
    );
  }

  const backupCodes = generateBackupCodes(BACKUP_CODE_COUNT);

  await userSecretsRef(auth.profile.uid).set(
    {
      totp: { secret, backupCodes: backupCodes.map(hashBackupCode) },
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  await snapshot.ref.update({
    "mfa.totp": { enabled: true },
    "mfa.preferredMethod": "totp",
    updatedAt: FieldValue.serverTimestamp(),
  });

  return NextResponse.json(
    {
      success: true,
      backupCodes,
      message:
        "Authenticator enabled. Store these backup codes somewhere safe — they will not be shown again.",
    },
    { status: 200, headers: NO_STORE }
  );
});
