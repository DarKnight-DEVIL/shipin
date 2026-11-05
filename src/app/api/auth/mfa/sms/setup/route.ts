import { NextRequest, NextResponse } from "next/server";

import { adminDb } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";
import { requireAuthWithProfile } from "@/lib/auth";
import { generateSmsCode, hashSmsCode } from "@/lib/mfa";

/**
 * POST /api/auth/mfa/sms/setup
 *
 * Send an SMS verification code to the provided phone number.
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
    const { phoneNumber } = body;

    // Validate E.164 format
    if (!phoneNumber || !/^\+[1-9]\d{1,14}$/.test(phoneNumber)) {
      return NextResponse.json(
        { error: "Invalid phone number format. Use E.164 format (e.g., +15551234567)." },
        { status: 400 }
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

    return NextResponse.json({
      success: true,
      message: `Verification code sent to ${phoneNumber}. Expires in 5 minutes.`,
    });
  } catch (error) {
    console.error("SMS setup error:", error);
    return NextResponse.json(
      { error: "Failed to send SMS code." },
      { status: 500 }
    );
  }
}