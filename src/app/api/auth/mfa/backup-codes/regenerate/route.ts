import { NextRequest, NextResponse } from "next/server";

import { adminDb } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";
import { requireAuthWithProfile } from "@/lib/auth";
import { generateBackupCodes, hashBackupCode, verifyTotp } from "@/lib/mfa";

/**
 * POST /api/auth/mfa/backup-codes/regenerate
 *
 * Generate new backup codes (invalidates old ones).
 * Requires admin authentication and TOTP verification.
 */
export async function POST(request: NextRequest) {
  const auth = await requireAuthWithProfile(request);
  if (auth instanceof NextResponse) return auth;

  if (auth.profile.role !== "admin") {
    return NextResponse.json(
      { error: "Administrator access required." },
      { status: 403 }
    );
  }

  try {
    const body = await request.json();
    const { totpCode } = body;

    if (!totpCode || typeof totpCode !== "string" || totpCode.length !== 6) {
      return NextResponse.json(
        { error: "Invalid TOTP code." },
        { status: 400 }
      );
    }

    const userSnapshot = await adminDb.collection("users").doc(auth.profile.uid).get();
    if (!userSnapshot.exists) {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }

    const userData = userSnapshot.data();
    const totpSecret = userData?.mfa?.totp?.secret;
    const totpEnabled = userData?.mfa?.totp?.enabled;

    if (!totpEnabled || !totpSecret) {
      return NextResponse.json(
        { error: "TOTP not enabled." },
        { status: 400 }
      );
    }

    // Verify TOTP before regenerating backup codes
    if (!verifyTotp(totpSecret, totpCode, 1)) {
      return NextResponse.json(
        { error: "Invalid TOTP code." },
        { status: 400 }
      );
    }

    // Generate new backup codes
    const backupCodes = generateBackupCodes(10);
    const hashedBackupCodes = backupCodes.map(hashBackupCode);

    await adminDb.collection("users").doc(auth.profile.uid).update({
      "mfa.totp.backupCodes": hashedBackupCodes,
      updatedAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({
      backupCodes,
      message: "New backup codes generated. Store them securely - old codes are now invalid.",
    });
  } catch (error) {
    console.error("Backup codes regenerate error:", error);
    return NextResponse.json(
      { error: "Failed to regenerate backup codes." },
      { status: 500 }
    );
  }
}