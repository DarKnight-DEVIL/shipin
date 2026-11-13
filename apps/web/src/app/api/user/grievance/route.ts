import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/utils/errors';
import { requireAuthWithProfile } from '@/lib/auth';
import { logRightsRequest } from '@/lib/compliance/rightsOps';

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

  const right = (body as Record<string, unknown>)?.right;
  const details = (body as Record<string, unknown>)?.details;

  if (!right || typeof right !== 'string') {
    return NextResponse.json(
      { success: false, error: 'Right type is required.', code: 'VALIDATION_ERROR' },
      { status: 400 }
    );
  }

  const validRights = ['access', 'correction', 'erasure', 'portability', 'grievance', 'nominee'];
  if (!validRights.includes(right)) {
    return NextResponse.json(
      { success: false, error: 'Invalid right type.', code: 'VALIDATION_ERROR' },
      { status: 400 }
    );
  }

  const requestId = await logRightsRequest({
    userId: auth.profile.uid,
    right: right as 'access' | 'correction' | 'erasure' | 'portability' | 'grievance' | 'nominee',
    details: typeof details === 'string' ? details : undefined,
  });

  return NextResponse.json({
    success: true,
    requestId,
    message: 'Your request has been submitted. We will respond within 30 days.',
  }, { status: 202 });
});

export const GET = withErrorHandler(async (request: NextRequest) => {
  const auth = await requireAuthWithProfile(request);
  if (auth instanceof NextResponse) return auth;

  // Import here to avoid circular dependency
  const { getUserRightsRequests } = await import('@/lib/compliance/rightsOps2');
  
  const requests = await getUserRightsRequests(auth.profile.uid);
  
  return NextResponse.json({
    success: true,
    requests,
  });
});