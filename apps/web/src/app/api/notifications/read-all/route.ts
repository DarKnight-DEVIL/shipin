import { NextResponse } from 'next/server';

import { requireAuthWithProfile } from '@/lib/auth';
import { adminDb } from '@/lib/firebaseAdmin';
import { withErrorHandler } from '@/utils/errors';

/**
 * POST /api/notifications/read-all
 *
 * Marks every unread notification belonging to the signed-in user as read.
 */
export const POST = withErrorHandler(async (request: Request) => {
  const auth = await requireAuthWithProfile(request);
  if (auth instanceof NextResponse) return auth;

  const snapshot = await adminDb
    .collection('notifications')
    .where('userId', '==', auth.profile.uid)
    .where('read', '==', false)
    .get();

  if (!snapshot.empty) {
    const batch = adminDb.batch();

    snapshot.docs.forEach((doc) => {
      batch.update(doc.ref, { read: true });
    });

    await batch.commit();
  }

  return NextResponse.json(
    { success: true, count: snapshot.size },
    { status: 200, headers: { 'Cache-Control': 'no-store' } }
  );
});
