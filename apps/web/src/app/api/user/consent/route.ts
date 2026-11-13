import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/utils/errors';
import { requireAuthWithProfile } from '@/lib/auth';
import { 
  getUserConsentState, 
  updateUserConsent, 
  getConsentLog,
  getGrantedCategories 
} from '@/lib/compliance/consent';

export const GET = withErrorHandler(async (request: NextRequest) => {
  const auth = await requireAuthWithProfile(request);
  if (auth instanceof NextResponse) return auth;

  const [state, log, granted] = await Promise.all([
    getUserConsentState(auth.profile.uid),
    getConsentLog(auth.profile.uid, 50),
    getGrantedCategories(auth.profile.uid),
  ]);

  return NextResponse.json({
    success: true,
    consentState: state,
    consentLog: log,
    grantedCategories: granted,
  });
});

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

  const { category, granted, version, method } = body as Record<string, unknown>;

  if (!category || typeof category !== 'string') {
    return NextResponse.json(
      { success: false, error: 'Category is required.', code: 'VALIDATION_ERROR' },
      { status: 400 }
    );
  }

  if (typeof granted !== 'boolean') {
    return NextResponse.json(
      { success: false, error: 'Granted must be boolean.', code: 'VALIDATION_ERROR' },
      { status: 400 }
    );
  }

  if (!version || typeof version !== 'string') {
    return NextResponse.json(
      { success: false, error: 'Version is required.', code: 'VALIDATION_ERROR' },
      { status: 400 }
    );
  }

  const validMethods = ['explicit', 'withdrawn'];
  const methodStr = typeof method === 'string' ? method : 'explicit';
  if (!validMethods.includes(methodStr)) {
    return NextResponse.json(
      { success: false, error: 'Invalid method.', code: 'VALIDATION_ERROR' },
      { status: 400 }
    );
  }

  const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip')
    || 'unknown';
  const userAgent = request.headers.get('user-agent') || 'unknown';

  await updateUserConsent({
    userId: auth.profile.uid,
    category,
    granted,
    version,
    method: methodStr as 'explicit' | 'withdrawn',
    ip: clientIp,
    userAgent,
  });

  return NextResponse.json({
    success: true,
    message: granted ? 'Consent granted' : 'Consent withdrawn',
  });
});
