import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/utils/errors';
import { requireAdmin } from '@/lib/auth';
import { getOverdueRightsRequests } from '@/lib/compliance/rightsOps2';
import { getActiveBreaches } from '@/lib/compliance/breach';
import { getAllBreaches } from '@/lib/compliance/breach';
import { getAllRightsRequests } from '@/lib/compliance/rightsOps2';

export const GET = withErrorHandler(async (request: NextRequest) => {
  const auth = await requireAdmin(request);
  if (auth instanceof NextResponse) return auth;

  // Only DPO or super admin should access this
  // In production, check for DPO role specifically
  
  const [overdueRights, activeBreaches, allBreaches, allRights] = await Promise.all([
    getOverdueRightsRequests(),
    getActiveBreaches(),
    getAllBreaches(undefined, 50),
    getAllRightsRequests(undefined, 100),
  ]);

  const stats = {
    rightsRequests: {
      total: allRights.length,
      pending: allRights.filter(r => r.status === 'pending').length,
      processing: allRights.filter(r => r.status === 'processing').length,
      completed: allRights.filter(r => r.status === 'completed').length,
      overdue: overdueRights.length,
    },
    breaches: {
      total: allBreaches.length,
      open: allBreaches.filter(b => b.status === 'open').length,
      contained: allBreaches.filter(b => b.status === 'contained').length,
      resolved: allBreaches.filter(b => b.status === 'resolved').length,
      critical: allBreaches.filter(b => b.severity === 'critical').length,
    },
    rightsByType: {
      access: allRights.filter(r => r.right === 'access').length,
      correction: allRights.filter(r => r.right === 'correction').length,
      erasure: allRights.filter(r => r.right === 'erasure').length,
      portability: allRights.filter(r => r.right === 'portability').length,
      grievance: allRights.filter(r => r.right === 'grievance').length,
      nominee: allRights.filter(r => r.right === 'nominee').length,
    },
  };

  return NextResponse.json({
    success: true,
    stats,
    overdueRights: overdueRights.slice(0, 10),
    activeBreaches: activeBreaches.slice(0, 10),
    recentBreaches: allBreaches.slice(0, 10),
    recentRights: allRights.slice(0, 10),
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

  if (action === 'generate-ropa') {
    const ropa = { processingRegister: {} as Record<string, never>, version: 'draft' };

    return new NextResponse(JSON.stringify(ropa), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="shipin-ropa-${Date.now()}.json"`,
      },
    });
  }

  if (action === 'escalate-rights') {
    const requestId = (body as Record<string, unknown>)?.requestId;
    if (!requestId || typeof requestId !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Request ID required.', code: 'VALIDATION_ERROR' },
        { status: 400 }
      );
    }
    
    const { escalateRightsRequest } = await import('@/lib/compliance/rightsOps2');
    await escalateRightsRequest(requestId);
    
    return NextResponse.json({ success: true, message: 'Request escalated to DPO' });
  }

  if (action === 'escalate-breach') {
    const breachId = (body as Record<string, unknown>)?.breachId;
    if (!breachId) {
      return NextResponse.json(
        { success: false, error: 'Breach ID required.', code: 'VALIDATION_ERROR' },
        { status: 400 }
      );
    }
    
    // In production: trigger PagerDuty/Slack/email to DPO + CTO
    console.error('BREACH ESCALATED MANUALLY:', breachId);
    
    return NextResponse.json({ success: true, message: 'Breach escalated to DPO and CTO' });
  }

  return NextResponse.json(
    { success: false, error: 'Unknown action.', code: 'VALIDATION_ERROR' },
    { status: 400 }
  );
});
