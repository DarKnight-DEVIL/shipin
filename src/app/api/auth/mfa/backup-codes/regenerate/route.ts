import { NextRequest, NextResponse } from "next/server";
import { withErrorHandler } from "@/utils/errors";

import { adminDb } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";
import { requireAuthWithProfile } from "@/lib/auth";
import { generateBackupCodes, hashBackupCode, verifyTotp } from "@/lib/mfa";

const NO_STORE = { "Cache-Control": "no-store" } as const;

/**
 * POST /api/auth/mfa/backup-codes/regenerate
 *
 * Generate new backup codes (invalidates old ones).
 * Requires admin authentication and TOTP verification.
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
  const { totpCode } = body as { totpCode?: unknown };

  if (typeof totpCode !== "string" || totpCode.length !== 6) {
    return NextResponse.json(
      { success: false, error: "Invalid TOTP code.", code: "INVALID_TOTP_CODE" },
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

  const userData = userSnapshot.data();
  const totpSecret = userData?.mfa?.totp?.secret;
  const totpEnabled = userData?.mfa?.totp?.enabled;

  if (!totpEnabled || !totpSecret) {
    return NextResponse.json(
      { success: false, error: "TOTP not enabled.", code: "TOTP_NOT_SETUP" },
      { status: 400, headers: NO_STORE }
    );
  }

  // Verify TOTP before regenerating backup codes
  if (!verifyTotp(totpSecret, totpCode, 1)) {
    return NextResponse.json(
      { success: false, error: "Invalid TOTP code.", code: "INVALID_TOTP_CODE" },
      { status: 400, headers: NO_STORE }
    );
  }

  // Generate new backup codes
  const backupCodes = generateBackupCodes(10);
  const hashedBackupCodes = backupCodes.map(hashBackupCode);

  await adminDb.collection("users").doc(auth.profile.uid).update({
    "mfa.totp.backupCodes": hashedBackupCodes,
    updatedAt: FieldValue.serverTimestamp(),
  });

  return NextResponse.json(
    {
      success: true,
      backupCodes,
      message: "New backup codes generated. Store them securely - old codes are now invalid.",
    },
    { status: 200, headers: NO_STORE }
  );
});