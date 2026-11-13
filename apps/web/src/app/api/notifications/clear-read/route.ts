import { NextResponse } from 'next/server';

import { requireAuthWithProfile } from '@/lib/auth';
import { adminDb } from '@/lib/firebaseAdmin';
import { withErrorHandler } from '@/utils/errors';

/**
 * POST /api/notifications/clear-read
 *
 * Deletes every notification already read by the signed-in user.
 */
export const POST = withErrorHandler(async (request: Request) => {
  const auth = await requireAuthWithProfile(request);
  if (auth instanceof NextResponse) return auth;

  const snapshot = await adminDb
    .collection('notifications')
    .where('userId', '==', auth.profile.uid)
    .where('read', '==', true)
    .get();

  if (!snapshot.empty) {
    const batch = adminDb.batch();

    snapshot.docs.forEach((doc) => {
      batch.delete(doc.ref);
    });

    await batch.commit();
  }

  return NextResponse.json(
    { success: true, count: snapshot.size },
    { status: 200, headers: { 'Cache-Control': 'no-store' } }
  );
});
