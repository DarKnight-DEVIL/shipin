import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { z } from 'zod';

import { requireAuthWithProfile } from '@/lib/auth';
import { adminDb } from '@/lib/firebaseAdmin';
import { ValidationError, withErrorHandler } from '@/utils/errors';

const addressSchema = z.object({
  label: z.string().trim().max(60).optional().default(''),
  recipientName: z.string().trim().min(1, 'Recipient name is required.').max(120),
  phone: z.string().trim().min(3, 'Phone number is required.').max(30),
  email: z.string().trim().max(255).optional(),
  country: z.string().trim().min(1, 'Country is required.').max(80),
  state: z.string().trim().min(1, 'State is required.').max(80),
  city: z.string().trim().min(1, 'City is required.').max(80),
  postalCode: z.string().trim().min(1, 'Postal code is required.').max(20),
  addressLine1: z.string().trim().min(1, 'Address line 1 is required.').max(200),
  addressLine2: z.string().trim().max(200).optional(),
  isDefault: z.boolean().optional().default(false),
});

/**
 * POST /api/addresses
 *
 * Saves a shipping address in the signed-in customer's address book.
 * The document path is derived from the verified token, never the body.
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

  const validated = addressSchema.safeParse(body);

  if (!validated.success) {
    throw new ValidationError(
      validated.error.issues[0]?.message ?? 'Invalid address details.',
      validated.error.issues
    );
  }

  const docRef = await adminDb
    .collection('users')
    .doc(auth.profile.uid)
    .collection('addresses')
    .add({
      ...validated.data,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

  return NextResponse.json(
    { success: true, addressId: docRef.id },
    { status: 201, headers: { 'Cache-Control': 'no-store' } }
  );
});
