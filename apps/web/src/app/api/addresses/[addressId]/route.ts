import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { z } from 'zod';

import { requireAuthWithProfile } from '@/lib/auth';
import { adminDb } from '@/lib/firebaseAdmin';
import { ValidationError, withErrorHandler } from '@/utils/errors';

const addressUpdateSchema = z.object({
  label: z.string().trim().max(60).optional(),
  recipientName: z.string().trim().min(1, 'Recipient name is required.').max(120).optional(),
  phone: z.string().trim().min(3, 'Phone number is required.').max(30).optional(),
  email: z.string().trim().max(255).optional(),
  country: z.string().trim().min(1, 'Country is required.').max(80).optional(),
  state: z.string().trim().min(1, 'State is required.').max(80).optional(),
  city: z.string().trim().min(1, 'City is required.').max(80).optional(),
  postalCode: z.string().trim().min(1, 'Postal code is required.').max(20).optional(),
  addressLine1: z.string().trim().min(1, 'Address line 1 is required.').max(200).optional(),
  addressLine2: z.string().trim().max(200).optional(),
  isDefault: z.boolean().optional(),
});

async function getOwnedAddressRef(request: Request, addressId: string) {
  const auth = await requireAuthWithProfile(request);
  if (auth instanceof NextResponse) return auth;

  return adminDb
    .collection('users')
    .doc(auth.profile.uid)
    .collection('addresses')
    .doc(addressId);
}

/**
 * PATCH /api/addresses/[addressId]
 *
 * Updates one address in the signed-in customer's address book.
 */
export const PATCH = withErrorHandler(
  async (
    request: NextRequest,
    { params }: { params: Promise<{ addressId: string }> }
  ) => {
    const { addressId } = await params;
    const addressRef = await getOwnedAddressRef(request, addressId);
    if (addressRef instanceof NextResponse) return addressRef;

    let body: unknown;

    try {
      body = await request.json();
    } catch {
      throw new ValidationError('Invalid request body.');
    }

    const validated = addressUpdateSchema.safeParse(body);

    if (!validated.success) {
      throw new ValidationError(
        validated.error.issues[0]?.message ?? 'Invalid address details.',
        validated.error.issues
      );
    }

    if (Object.keys(validated.data).length === 0) {
      throw new ValidationError('No address changes were provided.');
    }

    await addressRef.update({
      ...validated.data,
      updatedAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json(
      { success: true },
      { status: 200, headers: { 'Cache-Control': 'no-store' } }
    );
  }
);

/**
 * DELETE /api/addresses/[addressId]
 *
 * Removes one address from the signed-in customer's address book.
 */
export const DELETE = withErrorHandler(
  async (
    request: NextRequest,
    { params }: { params: Promise<{ addressId: string }> }
  ) => {
    const { addressId } = await params;
    const addressRef = await getOwnedAddressRef(request, addressId);
    if (addressRef instanceof NextResponse) return addressRef;

    await addressRef.delete();

    return NextResponse.json(
      { success: true },
      { status: 200, headers: { 'Cache-Control': 'no-store' } }
    );
  }
);
