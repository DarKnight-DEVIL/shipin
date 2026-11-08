import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';

import { requireAuthWithProfile } from '@/lib/auth';
import { adminDb } from '@/lib/firebaseAdmin';
import { idSchema } from '@/lib/validation';
import { NotFoundError, ValidationError, withErrorHandler } from '@/utils/errors';

async function getOwnedNotification(request: NextRequest, notificationId: string) {
  const auth = await requireAuthWithProfile(request);
  if (auth instanceof NextResponse) return auth;

  const notificationRef = adminDb.collection('notifications').doc(notificationId);
  const snapshot = await notificationRef.get();

  if (!snapshot.exists) {
    throw new NotFoundError('Notification');
  }

  if (snapshot.data()?.userId !== auth.profile.uid) {
    throw new NotFoundError('Notification');
  }

  return notificationRef;
}

export const PATCH = withErrorHandler(
  async (
    request: NextRequest,
    { params }: { params: Promise<{ notificationId: string }> }
  ) => {
    const { notificationId } = await params;
    if (!idSchema.safeParse(notificationId).success) {
      throw new ValidationError('Invalid notification ID.');
    }

    const notificationRef = await getOwnedNotification(request, notificationId);
    if (notificationRef instanceof NextResponse) return notificationRef;

    await notificationRef.update({
      read: true,
      readAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json(
      { success: true },
      { status: 200, headers: { 'Cache-Control': 'no-store' } }
    );
  }
);

export const DELETE = withErrorHandler(
  async (
    request: NextRequest,
    { params }: { params: Promise<{ notificationId: string }> }
  ) => {
    const { notificationId } = await params;
    if (!idSchema.safeParse(notificationId).success) {
      throw new ValidationError('Invalid notification ID.');
    }

    const notificationRef = await getOwnedNotification(request, notificationId);
    if (notificationRef instanceof NextResponse) return notificationRef;

    await notificationRef.delete();

    return NextResponse.json(
      { success: true },
      { status: 200, headers: { 'Cache-Control': 'no-store' } }
    );
  }
);
