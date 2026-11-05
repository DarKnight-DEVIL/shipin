import { NextRequest, NextResponse } from "next/server";

import { adminDb } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";
import { requireAuthWithProfile } from "@/lib/auth";
import { generateTotpSecret, getTotpQrUrl } from "@/lib/mfa";

/**
 * POST /api/auth/mfa/totp/setup
 *
 * Generate a new TOTP secret and QR code for the authenticated admin.
 * The secret is stored in the user profile but NOT enabled until verified.
 */
export async function POST(request: NextRequest) {
  const auth = await requireAuthWithProfile(request);
  if (auth instanceof NextResponse) return auth;

  // Only admins can set up MFA
  if (auth.profile.role !== "admin") {
    return NextResponse.json(
      { error: "Administrator access required." },
      { status: 403 }
    );
  }

  try {
    // Fetch full user profile for email/displayName
    const userSnapshot = await adminDb.collection("users").doc(auth.profile.uid).get();
    const userData = userSnapshot.data() || {};
    const email = userData.email || auth.token.email;
    const displayName = userData.displayName || auth.token.name || email;

    const secret = generateTotpSecret();
    const qrUrl = getTotpQrUrl(secret, "ShipIN Admin", email);

    // Store secret in profile (not enabled yet)
    await adminDb.collection("users").doc(auth.profile.uid).update({
      "mfa.totp": {
        secret,
        enabled: false,
        backupCodes: [],
      },
      "mfa.required": true,
      updatedAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({
      secret,
      qrUrl,
      message: "Scan the QR code with your authenticator app, then verify with /api/auth/mfa/totp/verify",
    });
  } catch (error) {
    console.error("MFA TOTP setup error:", error);
    return NextResponse.json(
      { error: "Failed to set up TOTP." },
      { status: 500 }
    );
  }
}