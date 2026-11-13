import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/utils/errors';
import { requireAuthWithProfile } from '@/lib/auth';
import { adminDb } from '@/lib/firebaseAdmin';

import { logRightsRequest, updateRightsRequest } from '@/lib/compliance/rightsOps2';

export const GET = withErrorHandler(async (request: NextRequest) => {
  const auth = await requireAuthWithProfile(request);
  if (auth instanceof NextResponse) return auth;

  // Log access request
  const requestId = await logRightsRequest({
    userId: auth.profile.uid,
    right: 'access',
    details: 'User requested access to their personal data',
  });


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



    const accessData = {
      profile: userDoc.exists ? userDoc.data() : null,
      orders: ordersSnap.docs.map(d => ({ id: d.id, ...d.data() })),
      wallet: walletDoc.exists ? walletDoc.data() : null,
      addresses: addressesSnap.docs.map(d => ({ id: d.id, ...d.data() })),
      notifications: notificationsSnap.docs.map(d => ({ id: d.id, ...d.data() })),
      supportTickets: supportSnap.docs.map(d => ({ id: d.id, ...d.data() })),
      consentLogs: consentLogsSnap.docs.map(d => ({ id: d.id, ...d.data() })),
      rightsRequests: rightsReqsSnap.docs.map(d => ({ id: d.id, ...d.data() })),
      accessedAt: new Date().toISOString(),
    };

    // Update request as completed
    await updateRightsRequest(requestId, 'completed', 'Data access provided', 'system');

    return NextResponse.json({
      success: true,
      data: accessData,
      requestId,
    });
  } catch (error) {
    console.error('Access request error:', error);
    await updateRightsRequest(requestId, 'rejected', 'Access request failed');
    
    return NextResponse.json(
      { success: false, error: 'Access request failed.', code: 'ACCESS_FAILED' },
      { status: 500 }
    );
  }
});

export const POST = withErrorHandler(async (request: NextRequest) => {
  // For submitting access requests via form
  const auth = await requireAuthWithProfile(request);
  if (auth instanceof NextResponse) return auth;

  const requestId = await logRightsRequest({
    userId: auth.profile.uid,
    right: 'access',
    details: 'User submitted access request via form',
  });

  return NextResponse.json({
    success: true,
    requestId,
    message: 'Access request submitted. We will respond within 30 days.',
  }, { status: 202 });
});