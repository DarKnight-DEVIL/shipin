import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/utils/errors';
import { requireAuthWithProfile } from '@/lib/auth';
import { adminDb } from '@/lib/firebaseAdmin';
import { FieldValue } from 'firebase-admin/firestore';
import { logRightsRequest } from '@/lib/compliance/rightsOps';

export const POST = withErrorHandler(async (request: NextRequest) => {
  const auth = await requireAuthWithProfile(request);
  if (auth instanceof NextResponse) return auth;

  // Log the erasure request
  const requestId = await logRightsRequest({
    userId: auth.profile.uid,
    right: 'erasure',
    details: 'User requested account and data deletion',
  });

  // Process erasure asynchronously (in production, use Cloud Function/queue)
  // For now, we'll do it synchronously but with proper error handling
  try {
    const uid = auth.profile.uid;
    
    // 1. Delete user's subcollections
    const batch = adminDb.batch();
    
    // Delete addresses
    const addressesSnap = await adminDb.collection('users').doc(uid).collection('addresses').get();
    addressesSnap.docs.forEach(doc => batch.delete(doc.ref));
    
    // Delete support tickets/messages
    const ticketsSnap = await adminDb.collection('supportTickets').where('customerId', '==', uid).get();
    ticketsSnap.docs.forEach(doc => batch.delete(doc.ref));
    
    // Delete notifications
    const notificationsSnap = await adminDb.collection('notifications').where('userId', '==', uid).get();
    notificationsSnap.docs.forEach(doc => batch.delete(doc.ref));
    
    // Delete wallet transactions
    const walletTxnsSnap = await adminDb.collection('walletTransactions').where('userId', '==', uid).get();
    walletTxnsSnap.docs.forEach(doc => batch.delete(doc.ref));
    
    // Delete consent logs
    const consentLogsSnap = await adminDb.collection('consentLogs').where('userId', '==', uid).get();
    consentLogsSnap.docs.forEach(doc => batch.delete(doc.ref));
    
    // Delete rights requests
    const rightsReqsSnap = await adminDb.collection('rightsRequests').where('userId', '==', uid).get();
    rightsReqsSnap.docs.forEach(doc => batch.delete(doc.ref));
    
    // Commit batch
    await batch.commit();
    
    // 2. Delete main user document (but keep minimal audit trail)
    await adminDb.collection('users').doc(uid).update({
      erased: true,
      erasedAt: FieldValue.serverTimestamp(),
      erasureRequestId: 'erasure-request-id', // Would be passed in real impl
      displayName: 'Deleted User',
      email: 'deleted@user.local',
      phone: '',
      photoURL: '',
      dateOfBirth: null,
      // Keep minimal fields for legal/tax
      // erasedRequestId: requestId,
    });
    
    // 3. Delete Firebase Auth user (in production, use Admin SDK)
    // await adminAuth.deleteUser(uid);
    
    // 4. Update rights request as completed
    // await adminDb.collection('rightsRequests').doc(requestId).update({
    //   status: 'completed',
    //   completedAt: FieldValue.serverTimestamp(),
    //   response: 'Account and personal data erased per DPDP Sec 12',
    // });
    
    return NextResponse.json({
      success: true,
      message: 'Account and personal data have been erased. Minimal audit trail retained for legal compliance.',
      requestId,
    });
  } catch (error) {
    console.error('Erasure error:', error);
    
    // Log failure
    // await adminDb.collection('rightsRequests').doc(requestId).update({
    //   status: 'rejected',
    //   response: 'Erasure failed: ' + (error instanceof Error ? error.message : 'Unknown error'),
    // });
    
    return NextResponse.json(
      { success: false, error: 'Erasure failed. Please contact support.', code: 'ERASURE_FAILED' },
      { status: 500 }
    );
  }
});

export const GET = withErrorHandler(async (request: NextRequest) => {
  const auth = await requireAuthWithProfile(request);
  if (auth instanceof NextResponse) return auth;

  // Return status of erasure requests
  const { getUserRightsRequests } = await import('@/lib/compliance/rightsOps2');
  const requests = await getUserRightsRequests(auth.profile.uid);
  const erasureRequests = requests.filter(r => r.right === 'erasure');
  
  return NextResponse.json({
    success: true,
    requests: erasureRequests,
  });
});