import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/utils/errors';
import { requireAuthWithProfile } from '@/lib/auth';
import { 
  verifyParentalConsent, 
  verifyParentalConsentOTP, 
  hasParentalConsent,
  enforceAgeGate 
} from '@/lib/compliance/ageOps';

export const POST = withErrorHandler(async (request: NextRequest) => {
  const auth = await requireAuthWithProfile(request);
  if (auth instanceof NextResponse) return auth;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: 'Invalid JSON body.', code: 'INVALID_JSON' },
      { status: 400 }
    );
  }

  const action = (body as Record<string, unknown>)?.action;

  if (action === 'request') {
    const { parentEmail, method } = body as Record<string, unknown>;
    
    if (!parentEmail || typeof parentEmail !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Parent email required.', code: 'VALIDATION_ERROR' },
        { status: 400 }
      );
    }

    if (!method || !['otp', 'digital_signature', 'video_kyc', 'aadhaar'].includes(method as string)) {
      return NextResponse.json(
        { success: false, error: 'Valid method required (otp/digital_signature/video_kyc/aadhaar).', code: 'VALIDATION_ERROR' },
        { status: 400 }
      );
    }

    const result = await verifyParentalConsent({
      childUid: auth.profile.uid,
      parentEmail: parentEmail as string,
      consentMethod: method as 'otp' | 'digital_signature' | 'video_kyc' | 'aadhaar',
    });

    return NextResponse.json(result);
  }

  if (action === 'verify-otp') {
    const { consentId, otp } = body as Record<string, unknown>;
    
    if (!consentId || typeof consentId !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Consent ID required.', code: 'VALIDATION_ERROR' },
        { status: 400 }
      );
    }

    if (!otp || typeof otp !== 'string') {
      return NextResponse.json(
        { success: false, error: 'OTP required.', code: 'VALIDATION_ERROR' },
        { status: 400 }
      );
    }

    const result = await verifyParentalConsentOTP({
      consentId: consentId as string,
      otp: otp as string,
    });

    return NextResponse.json(result);
  }

  if (action === 'check') {
    // Check if user needs parental consent
    const gate = await enforceAgeGate(auth.profile.uid);
    return NextResponse.json(gate);
  }

  return NextResponse.json(
    { success: false, error: 'Unknown action.', code: 'VALIDATION_ERROR' },
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