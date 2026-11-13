import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { getAdminAuthError, requireAdmin } from '@/lib/adminAuth';
import { recordAdminAudit } from '@/lib/adminAudit';

const NO_STORE = { 'Cache-Control': 'no-store' } as const;

export const GET = async (req: NextRequest, context: Record<string, unknown>) => {
  try {
    const admin = await requireAdmin(req);

    const { params } = context as { params: Promise<{ uid: string }> };
    const { uid } = await params;
    if (!uid) {
      return NextResponse.json(
        { success: false, error: 'User ID is required.' },
        { status: 400, headers: NO_STORE }
      );
    }

    const userSnap = await adminDb.collection('users').doc(uid).get();
    if (!userSnap.exists) {
      return NextResponse.json(
        { success: false, error: 'User not found.' },
        { status: 404, headers: NO_STORE }
      );
    }

    const wallet = userSnap.data()?.wallet ?? {};
    const balance = (wallet as { currentBalance?: number }).currentBalance ?? 0;
    const updatedAt =
      (wallet.updatedAt as { toMillis?: () => number } | null)?.toMillis?.() ?? null;

    try {
      await recordAdminAudit({
        actorUid: admin.uid,
        actorEmail: admin.email,
        action: 'wallet.balance_read',
        targetType: 'user',
        targetId: uid,
        detail: { balance, updatedAt },
      });
    } catch {
      /* best-effort audit — the balance read already succeeded */
    }

    return NextResponse.json(
      { success: true, uid, balance, updatedAt },
      { status: 200, headers: NO_STORE }
    );
  } catch (error) {
    const authError = getAdminAuthError(error);

    if (
      authError.status !== 500 ||
      (error instanceof Error &&
        [
          'AUTHENTICATION_REQUIRED',
          'INVALID_AUTHENTICATION',
          'USER_PROFILE_NOT_FOUND',
          'ADMIN_ACCESS_REQUIRED',
        ].includes(error.message))
    ) {
      return NextResponse.json(
        { success: false, error: authError.error },
        { status: authError.status, headers: NO_STORE }
      );
    }

    console.error('Admin wallet balance error:', error);

    return NextResponse.json(
      { success: false, error: 'Unable to read wallet balance.' },
      { status: 500, headers: NO_STORE }
    );
  }
};
