import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { z } from 'zod';

import { requireAuthWithProfile } from '@/lib/auth';
import { adminDb } from '@/lib/firebaseAdmin';
import { ValidationError, withErrorHandler } from '@/utils/errors';

const notificationPreferencesSchema = z.object({
  channels: z.object({
    inApp: z.boolean(),
    email: z.boolean(),
    whatsapp: z.boolean(),
  }),
  whatsapp: z.object({
    phone: z.string().trim().max(30).optional().default(''),
    consentedAt: z.string().trim().max(64).optional(),
  }),
  categories: z.object({
    quote: z.boolean(),
    payment: z.boolean(),
    warehouse: z.boolean(),
    shipping: z.boolean(),
    delivery: z.boolean(),
    support: z.boolean(),
  }),
});

/**
 * PATCH /api/notifications/preferences
 *
 * Saves the signed-in customer's notification channel and category settings.
 */
export const PATCH = withErrorHandler(async (request: NextRequest) => {
  const auth = await requireAuthWithProfile(request);
  if (auth instanceof NextResponse) return auth;

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    throw new ValidationError('Invalid request body.');
  }

  const validated = notificationPreferencesSchema.safeParse(body);

  if (!validated.success) {
    throw new ValidationError(
      validated.error.issues[0]?.message ?? 'Invalid notification preferences.',
      validated.error.issues
    );
  }

  await adminDb.collection('users').doc(auth.profile.uid).update({
    'preferences.notifications': validated.data,
    preferencesUpdatedAt: FieldValue.serverTimestamp(),
  });

  return NextResponse.json(
    { success: true },
    { status: 200, headers: { 'Cache-Control': 'no-store' } }
  );
});
