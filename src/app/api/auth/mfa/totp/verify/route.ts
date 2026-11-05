import { NextRequest, NextResponse } from "next/server";

import { adminDb } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";
import { requireAuthWithProfile } from "@/lib/auth";
import { verifyTotp, generateBackupCodes, hashBackupCode } from "@/lib/mfa";

/**
 * POST /api/auth/mfa/totp/verify
 *
 * Verify a TOTP code and enable TOTP MFA.
 * Generates backup codes upon successful verification.
 */
export async function POST(request: NextRequest) {
  const auth = await requireAuthWithProfile(request);
  if (auth instanceof NextResponse) return auth;

  // Only admins
  if (auth.profile.role !== "admin") {
    return NextResponse.json(
      { error: "Administrator access required." },
      { status: 403 }
    );
  }

  try {
    const body = await request.json();
    const { code } = body;

    if (!code || typeof code !== "string" || code.length !== 6) {
      return NextResponse.json(
        { error: "Invalid TOTP code format." },
        { status: 400 }
      );
    }

    // Get user profile with TOTP secret
    const userSnapshot = await adminDb.collection("users").doc(auth.profile.uid).get();
    if (!userSnapshot.exists) {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }

    const userData = userSnapshot.data();
    const totpSecret = userData?.mfa?.totp?.secret;

    if (!totpSecret) {
      return NextResponse.json(
        { error: "TOTP not set up. Call /api/auth/mfa/totp/setup first." },
        { status: 400 }
      );
    }

    // Verify the code (allow ±1 window for clock drift)
    if (!verifyTotp(totpSecret, code, 1)) {
      return NextResponse.json(
        { error: "Invalid TOTP code." },
        { status: 400 }
      );
    }

    // Generate backup codes
    const backupCodes = generateBackupCodes(10);
    const hashedBackupCodes = backupCodes.map(hashBackupCode);

    // Update profile: enable TOTP, store hashed backup codes
    await adminDb.collection("users").doc(auth.profile.uid).update({
      "mfa.totp.enabled": true,
      "mfa.totp.backupCodes": hashedBackupCodes,
      updatedAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({
      success: true,
      backupCodes,
      message: "TOTP enabled. Store these backup codes securely - they will not be shown again.",
    });
  } catch (error) {
    console.error("MFA TOTP verify error:", error);
    return NextResponse.json(
      { error: "Failed to verify TOTP." },
      { status: 500 }
    );
  }
}