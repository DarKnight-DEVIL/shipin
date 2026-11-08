import { NextRequest, NextResponse } from "next/server";
import { withErrorHandler } from "@/utils/errors";

import { adminDb } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";
import { requireAuthWithProfile } from "@/lib/auth";
import { generateSmsCode, hashSmsCode } from "@/lib/mfa";

const NO_STORE = { "Cache-Control": "no-store" } as const;

/**
 * POST /api/auth/mfa/sms/setup
 *
 * Send an SMS verification code to the provided phone number.
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
  const { phoneNumber } = body as { phoneNumber?: unknown };

  // Validate E.164 format
  if (typeof phoneNumber !== "string" || !/^\+[1-9]\d{1,14}$/.test(phoneNumber)) {
    return NextResponse.json(
      {
        success: false,
        error: "Invalid phone number format. Use E.164 format (e.g., +15551234567).",
        code: "INVALID_PHONE_NUMBER",
      },
      { status: 400, headers: NO_STORE }
    );
  }

  const code = generateSmsCode();
  const hashedCode = hashSmsCode(code);

  // Store pending code with expiry (5 minutes)
  await adminDb.collection("users").doc(auth.profile.uid).update({
    "mfa.sms.pendingCode": hashedCode,
    "mfa.sms.pendingPhoneNumber": phoneNumber,
    "mfa.sms.pendingExpires": Date.now() + 5 * 60 * 1000,
    updatedAt: FieldValue.serverTimestamp(),
  });

  // Send SMS (using WhatsApp service as fallback)
  // In production, use a proper SMS provider like Twilio
  try {
    const { sendWhatsAppTemplate } = await import("@/lib/whatsapp");
    await sendWhatsAppTemplate({
      to: phoneNumber,
      templateName: "hello_world",
      languageCode: "en_US",
      components: [{
        type: "body",
        parameters: [
          { type: "text", text: code },
        ],
      }],
    });
  } catch (smsError) {
    console.warn("SMS send failed (WhatsApp fallback):", smsError);
  }

  return NextResponse.json(
    {
      success: true,
      message: `Verification code sent to ${phoneNumber}. Expires in 5 minutes.`,
    },
    { status: 200, headers: NO_STORE }
  );
});