import { NextRequest, NextResponse } from 'next/server';

import { requireAuthWithProfile } from '@/lib/auth';
import { adminDb } from '@/lib/firebaseAdmin';
import { NotFoundError, withErrorHandler } from '@/utils/errors';

/**
 * POST /api/addresses/[addressId]/default
 *
 * Makes one saved address the customer's default, clearing the flag on all
 * their other addresses.
 */
export const POST = withErrorHandler(
  async (
    request: NextRequest,
    { params }: { params: Promise<{ addressId: string }> }
  ) => {
    const auth = await requireAuthWithProfile(request);
    if (auth instanceof NextResponse) return auth;

    const { addressId } = await params;

    const addressesRef = adminDb
      .collection('users')
      .doc(auth.profile.uid)
      .collection('addresses');

    const snapshot = await addressesRef.get();

    if (!snapshot.docs.some((doc) => doc.id === addressId)) {
      throw new NotFoundError('Address');
    }

    const batch = adminDb.batch();

    snapshot.docs.forEach((doc) => {
      batch.update(doc.ref, { isDefault: doc.id === addressId });
    });

    await batch.commit();

    return NextResponse.json(
      { success: true },
      { status: 200, headers: { 'Cache-Control': 'no-store' } }
    );
  }
);
