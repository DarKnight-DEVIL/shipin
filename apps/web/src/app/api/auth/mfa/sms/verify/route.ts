import { NextRequest, NextResponse } from "next/server";
import { withErrorHandler } from "@/utils/errors";

import { adminDb } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";
import { requireAuthWithProfile } from "@/lib/auth";
import { hashSmsCode } from "@/lib/mfa";

const NO_STORE = { "Cache-Control": "no-store" } as const;

/**
 * POST /api/auth/mfa/sms/verify
 *
 * Verify the SMS code and enable SMS MFA.
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
  const { code } = body as { code?: unknown };

  if (typeof code !== "string" || code.length !== 6) {
    return NextResponse.json(
      { success: false, error: "Invalid code format.", code: "INVALID_VERIFICATION_CODE" },
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
  const pendingCode = userData?.mfa?.sms?.pendingCode;
  const pendingPhoneNumber = userData?.mfa?.sms?.pendingPhoneNumber;
  const pendingExpires = userData?.mfa?.sms?.pendingExpires;

  if (!pendingCode || !pendingPhoneNumber || !pendingExpires) {
    return NextResponse.json(
      {
        success: false,
        error: "No pending SMS verification. Request a new code.",
        code: "SMS_VERIFICATION_NOT_PENDING",
      },
      { status: 400, headers: NO_STORE }
    );
  }

  if (Date.now() > pendingExpires) {
    return NextResponse.json(
      { success: false, error: "Verification code expired. Request a new one.", code: "SMS_CODE_EXPIRED" },
      { status: 400, headers: NO_STORE }
    );
  }

  const hashedInput = hashSmsCode(code);
  if (hashedInput !== pendingCode) {
    return NextResponse.json(
      { success: false, error: "Invalid verification code.", code: "INVALID_VERIFICATION_CODE" },
      { status: 400, headers: NO_STORE }
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

  return NextResponse.json(
    { success: true, message: "SMS MFA enabled successfully." },
    { status: 200, headers: NO_STORE }
  );
});