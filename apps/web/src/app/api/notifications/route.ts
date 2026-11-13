import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { requireAuthWithProfile } from '@/lib/auth';
import { adminDb } from '@/lib/firebaseAdmin';
import { createNotification } from '@/features/notifications/services/server';
import { ValidationError, withErrorHandler } from '@/utils/errors';

const notificationTypeSchema = z.enum([
  'quote',
  'payment',
  'warehouse',
  'inspection',
  'shipment',
  'delivery',
  'system',
]);

const createNotificationSchema = z.object({
  userId: z.string().trim().min(1).max(64).optional(),
  requestId: z.string().trim().min(1).max(64).nullable().optional(),
  title: z.string().trim().min(1, 'Title is required.').max(200),
  message: z.string().trim().min(1, 'Message is required.').max(2000),
  type: notificationTypeSchema,
});

/**
 * POST /api/notifications
 *
 * Creates a notification for the signed-in user. Admins may target another
 * customer by passing `userId`; other callers can only notify themselves.
 */
export const POST = withErrorHandler(async (request: NextRequest) => {
  const auth = await requireAuthWithProfile(request);
  if (auth instanceof NextResponse) return auth;

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    throw new ValidationError('Invalid request body.');
  }

  const validated = createNotificationSchema.safeParse(body);

  if (!validated.success) {
    throw new ValidationError(
      validated.error.issues[0]?.message ?? 'Invalid notification details.',
      validated.error.issues
    );
  }

  const { userId, requestId, title, message, type } = validated.data;

  const recipientId = userId ?? auth.profile.uid;

  if (recipientId !== auth.profile.uid && auth.profile.role !== 'admin') {
    throw new ValidationError('You cannot create notifications for another user.');
  }

  if (requestId) {
    const requestSnapshot = await adminDb.collection('requests').doc(requestId).get();

    if (!requestSnapshot.exists) {
      throw new ValidationError('Request not found.');
    }

    if (requestSnapshot.data()?.userId !== recipientId) {
      throw new ValidationError('The request does not belong to the notification recipient.');
    }
  }

  const notificationId = await createNotification(
    recipientId,
    requestId ?? null,
    title,
    message,
    type
  );

  return NextResponse.json(
    { success: true, notificationId },
    { status: 201, headers: { 'Cache-Control': 'no-store' } }
  );
});
