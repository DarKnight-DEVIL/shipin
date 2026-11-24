import { NextRequest, NextResponse } from "next/server";
import { withErrorHandler } from "@/utils/errors";
import { requireAuthWithProfile } from "@/lib/auth";
import {
  verifyParentalConsent,
  verifyParentalConsentOTP,
  hasParentalConsent,
  enforceAgeGate,
} from "@/lib/compliance/ageOps";
import {
  ageVerificationBodySchema,
  readAndValidateBody,
} from "@/lib/validation";

export const POST = withErrorHandler(async (request: NextRequest) => {
  const auth = await requireAuthWithProfile(request);
  if (auth instanceof NextResponse) return auth;

  const parsed = await readAndValidateBody(request, ageVerificationBodySchema);

  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,
        error:
          parsed.reason === "parse"
            ? "Invalid JSON body."
            : "Invalid request body.",
        code: "VALIDATION_ERROR",
      },
      { status: 400 }
    );
  }

  const body = parsed.data;

  if (body.action === "request") {
    const { parentEmail, method } = body;

    const result = await verifyParentalConsent({
      childUid: auth.profile.uid,
      parentEmail,
      consentMethod: method,
    });

    return NextResponse.json(result);
  }

  if (body.action === "verify-otp") {
    const { consentId, otp } = body;

    const result = await verifyParentalConsentOTP({
      consentId,
      otp,
    });

    return NextResponse.json(result);
  }

  if (body.action === "check") {
    // Check if user needs parental consent
    const gate = await enforceAgeGate(auth.profile.uid);
    return NextResponse.json(gate);
  }

  return NextResponse.json(
    { success: false, error: "Unknown action.", code: "VALIDATION_ERROR" },
    { status: 400 }
  );
});

export const GET = withErrorHandler(async (request: NextRequest) => {
  const auth = await requireAuthWithProfile(request);
  if (auth instanceof NextResponse) return auth;

  const hasConsent = await hasParentalConsent(auth.profile.uid);
  const gate = await enforceAgeGate(auth.profile.uid);

  return NextResponse.json({
    success: true,
    parentalConsentVerified: hasConsent,
    ageGate: gate,
  });
});
