import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/utils/errors';
import { requireAuthWithProfile } from '@/lib/auth';
import { adminDb } from '@/lib/firebaseAdmin';

import { logRightsRequest, updateRightsRequest } from '@/lib/compliance/rightsOps2';

export const POST = withErrorHandler(async (request: NextRequest) => {
  const auth = await requireAuthWithProfile(request);
  if (auth instanceof NextResponse) return auth;

  // Log the portability request
  const requestId = await logRightsRequest({
    userId: auth.profile.uid,
    right: 'portability',
    details: 'User requested data export',
  });

  return NextResponse.json({
    success: true,
    requestId,
    message: 'Export request submitted. You will receive a download link when ready.',
  }, { status: 202 });
});

export const GET = withErrorHandler(async (request: NextRequest) => {
  const auth = await requireAuthWithProfile(request);
  if (auth instanceof NextResponse) return auth;

  // Check for existing completed export request
  const { getUserRightsRequests } = await import('@/lib/compliance/rightsOps2');
  const requests = await getUserRightsRequests(auth.profile.uid);
  const exportRequests = requests.filter(r => r.right === 'portability' && r.status === 'completed');
  
  if (exportRequests.length > 0) {
    const latest = exportRequests[0];
    if (latest.completedAt && new Date().getTime() - new Date(latest.completedAt).getTime() < 24 * 60 * 60 * 1000) {
      // Return cached export if less than 24 hours old
      return NextResponse.json({
        success: true,
        cached: true,
        exportedAt: latest.completedAt,
        message: 'Recent export available. Generating new one...',
      });
    }
  }

  // Log new export request
  const requestId = await logRightsRequest({
    userId: auth.profile.uid,
    right: 'portability',
    details: 'User requested fresh data export',
  });
  void requestId;

  try {
    // Collect all user data
    const [userDoc, ordersSnap, walletDoc, addressesSnap, notificationsSnap, supportSnap, consentLogsSnap, rightsReqsSnap] = await Promise.all([
      adminDb.collection('users').doc(auth.profile.uid).get(),
      adminDb.collection('requests').where('userId', '==', auth.profile.uid).get(),
      adminDb.collection('wallets').doc(auth.profile.uid).get(),
      adminDb.collection('users').doc(auth.profile.uid).collection('addresses').get(),
      adminDb.collection('notifications').where('userId', '==', auth.profile.uid).get(),
      adminDb.collection('supportTickets').where('customerId', '==', auth.profile.uid).get(),
      adminDb.collection('consentLogs').where('userId', '==', auth.profile.uid).orderBy('timestamp', 'desc').limit(100).get(),
      adminDb.collection('rightsRequests').where('userId', '==', auth.profile.uid).orderBy('createdAt', 'desc').limit(50).get(),
    ]);

    const exportData = {
      profile: userDoc.exists ? userDoc.data() : null,
      orders: ordersSnap.docs.map(d => ({ id: d.id, ...d.data() })),
      wallet: walletDoc.exists ? walletDoc.data() : null,
      addresses: addressesSnap.docs.map(d => ({ id: d.id, ...d.data() })),
      notifications: notificationsSnap.docs.map(d => ({ id: d.id, ...d.data() })),
      supportTickets: supportSnap.docs.map(d => ({ id: d.id, ...d.data() })),
      consentLogs: consentLogsSnap.docs.map(d => ({ id: d.id, ...d.data() })),
      rightsRequests: rightsReqsSnap.docs.map(d => ({ id: d.id, ...d.data() })),
      exportedAt: new Date().toISOString(),
      exportRequestId: requestId,
    };

    // Update request as completed
    await updateRightsRequest(requestId, 'completed', 'Data export completed', 'system');

    // Return as downloadable JSON
    return new NextResponse(JSON.stringify(exportData, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="shipin-data-${auth.profile.uid}-${Date.now()}.json"`,
      },
    });
  } catch (error) {
    console.error('Export error:', error);
    await updateRightsRequest(requestId, 'rejected', 'Export failed: ' + (error instanceof Error ? error.message : 'Unknown error'));
    
    return NextResponse.json(
      { success: false, error: 'Export failed. Please try again.', code: 'EXPORT_FAILED' },
      { status: 500 }
    );
  }
});