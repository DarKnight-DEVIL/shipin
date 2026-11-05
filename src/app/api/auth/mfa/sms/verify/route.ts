import { NextRequest, NextResponse } from "next/server";

import { adminDb } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";
import { requireAuthWithProfile } from "@/lib/auth";
import { hashSmsCode } from "@/lib/mfa";

/**
 * POST /api/auth/mfa/sms/verify
 *
 * Verify the SMS code and enable SMS MFA.
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
    const { code } = body;

    if (!code || typeof code !== "string" || code.length !== 6) {
      return NextResponse.json(
        { error: "Invalid code format." },
        { status: 400 }
      );
    }

    const userSnapshot = await adminDb.collection("users").doc(auth.profile.uid).get();
    if (!userSnapshot.exists) {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }

    const userData = userSnapshot.data();
    const pendingCode = userData?.mfa?.sms?.pendingCode;
    const pendingPhoneNumber = userData?.mfa?.sms?.pendingPhoneNumber;
    const pendingExpires = userData?.mfa?.sms?.pendingExpires;

    if (!pendingCode || !pendingPhoneNumber || !pendingExpires) {
      return NextResponse.json(
        { error: "No pending SMS verification. Request a new code." },
        { status: 400 }
      );
    }

    if (Date.now() > pendingExpires) {
      return NextResponse.json(
        { error: "Verification code expired. Request a new one." },
        { status: 400 }
      );
    }

    const hashedInput = hashSmsCode(code);
    if (hashedInput !== pendingCode) {
      return NextResponse.json(
        { error: "Invalid verification code." },
        { status: 400 }
      );
    }

    // Enable SMS MFA
    await adminDb.collection("users").doc(auth.profile.uid).update({
      "mfa.sms.enabled": true,
      "mfa.sms.phoneNumber": pendingPhoneNumber,
      "mfa.sms.pendingCode": FieldValue.delete(),
      "mfa.sms.pendingPhoneNumber": FieldValue.delete(),
      "mfa.sms.pendingExpires": FieldValue.delete(),
      "mfa.required": true,
      updatedAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({
      success: true,
      message: "SMS MFA enabled successfully.",
    });
  } catch (error) {
    console.error("SMS verify error:", error);
    return NextResponse.json(
      { error: "Failed to verify SMS code." },
      { status: 500 }
    );
  }
}