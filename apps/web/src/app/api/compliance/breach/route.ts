import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/utils/errors';
import { requireAdmin } from '@/lib/auth';
import { recordBreach, updateBreach, getAllBreaches } from '@/lib/compliance/breach';

export const GET = withErrorHandler(async (request: NextRequest) => {
  const auth = await requireAdmin(request);
  if (auth instanceof NextResponse) return auth;

  const breaches = await getAllBreaches(undefined, 100);
  
  return NextResponse.json({
    success: true,
    breaches,
  });
});

export const POST = withErrorHandler(async (request: NextRequest) => {
  const auth = await requireAdmin(request);
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

  if (action === 'record') {
    const { 
      severity, 
      description, 
      affectedCategories, 
      estimatedAffectedUsers, 
      discoveredAt,
      containedAt,
      rootCause,
      remediationSteps,
      reportedToBoard,
      reportedToUsers,
    } = body as Record<string, unknown>;

    // Validation
    if (!severity || !['low', 'medium', 'high', 'critical'].includes(severity as string)) {
      return NextResponse.json(
        { success: false, error: 'Valid severity required (low/medium/high/critical).', code: 'VALIDATION_ERROR' },
        { status: 400 }
      );
    }

    if (!description || typeof description !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Description required.', code: 'VALIDATION_ERROR' },
        { status: 400 }
      );
    }

    if (!affectedCategories || !Array.isArray(affectedCategories) || affectedCategories.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Affected categories required.', code: 'VALIDATION_ERROR' },
        { status: 400 }
      );
    }

    if (typeof estimatedAffectedUsers !== 'number' || estimatedAffectedUsers < 0) {
      return NextResponse.json(
        { success: false, error: 'Estimated affected users must be a number.', code: 'VALIDATION_ERROR' },
        { status: 400 }
      );
    }

    if (!discoveredAt || typeof discoveredAt !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Discovered date required.', code: 'VALIDATION_ERROR' },
        { status: 400 }
      );
    }

    const breachId = await recordBreach({
      severity: severity as 'low' | 'medium' | 'high' | 'critical',
      description: description as string,
      affectedCategories: affectedCategories as string[],
      estimatedAffectedUsers: estimatedAffectedUsers as number,
      discoveredAt: new Date(discoveredAt as string),
      containedAt: containedAt ? new Date(containedAt as string) : undefined,
      rootCause: typeof rootCause === 'string' ? rootCause : undefined,
      remediationSteps: Array.isArray(remediationSteps) ? remediationSteps as string[] : undefined,
      reportedToBoard: reportedToBoard === true,
      reportedToUsers: reportedToUsers === true,
    });

    return NextResponse.json({
      success: true,
      breachId,
      message: 'Breach recorded. Remember: 72-hour notification to Data Protection Board required for high/critical breaches.',
    }, { status: 201 });
  }

  return NextResponse.json(
    { success: false, error: 'Unknown action.', code: 'VALIDATION_ERROR' },
    { status: 400 }
  );
});

export const PATCH = withErrorHandler(async (request: NextRequest) => {
  const auth = await requireAdmin(request);
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

  const breachId = (body as Record<string, unknown>)?.breachId;
  if (!breachId || typeof breachId !== 'string') {
    return NextResponse.json(
      { success: false, error: 'Breach ID required.', code: 'VALIDATION_ERROR' },
      { status: 400 }
    );
  }

  const { 
    containedAt,
    rootCause,
    remediationSteps,
    reportedToBoard,
    reportedToUsers,
    status,
  } = body as Record<string, unknown>;

  const updates: Partial<{
    containedAt: Date;
    rootCause: string;
    remediationSteps: string[];
    reportedToBoard: boolean;
    reportedToUsers: boolean;
    status: 'open' | 'contained' | 'resolved' | 'closed';
  }> = {};

  if (containedAt && typeof containedAt === 'string') updates.containedAt = new Date(containedAt);
  if (rootCause && typeof rootCause === 'string') updates.rootCause = rootCause;
  if (remediationSteps && Array.isArray(remediationSteps)) updates.remediationSteps = remediationSteps as string[];
  if (typeof reportedToBoard === 'boolean') updates.reportedToBoard = reportedToBoard;
  if (typeof reportedToUsers === 'boolean') updates.reportedToUsers = reportedToUsers;
  if (status && typeof status === 'string') {
    updates.status = status as 'open' | 'contained' | 'resolved' | 'closed';
  }

  await updateBreach(breachId, updates);

  return NextResponse.json({
    success: true,
    message: 'Breach record updated',
  });
});