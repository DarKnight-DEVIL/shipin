import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebaseAdmin';
import { withErrorHandler } from '@/utils/errors';
import { isQuoteExpired } from '@/features/requests/services/quoteExpiry';
import { createNotification } from '@/features/notifications/services/server';
import type { Request } from '@/types/request';

const NO_STORE = { 'Cache-Control': 'no-store' } as const;

/**
 * POST /api/admin/requests/quotes/expire
 *
 * Cron-triggered (via GitHub Actions) endpoint that scans all requests with
 * an unexpired quote, marks those whose expiresAt has passed as expired,
 * and notifies the customer.
 *
 * Authenticated by a shared CRON_SECRET Bearer token — NOT by Firebase admin
 * auth, because the caller is a scheduled GitHub Actions workflow, not a user.
 * The secret must match process.env.CRON_SECRET.
 */
export const POST = withErrorHandler(async (request: NextRequest) => {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized.', code: 'UNAUTHORIZED' },
      { status: 401, headers: NO_STORE }
    );
  }

  const now = Date.now();
  let scanned = 0;
  let expired = 0;

  // Firestore cannot index into quote.expired for a collection-wide query,
  // so fetch every request that has a quote and filter in memory. Requests
  // without a quote are skipped by the quote field being undefined.
  const snapshot = await adminDb.collection('requests').get();

  for (const doc of snapshot.docs) {
    scanned++;
    const data = doc.data() as Request;
    const quote = data.quote;

    // Skip requests with no quote or already-marked-expired quotes.
    if (!quote || quote.expired) continue;

    if (!isQuoteExpired(quote.expiresAt)) continue;

    // Mark the quote expired and notify the customer.
    await doc.ref.update({
      'quote.expired': true,
      'quote.expiredAt': FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    // Best-effort notification: a failure here must not fail the cron job,
    // because the quote is already marked expired in the DB.
    try {
      await createNotification(
        data.userId,
        doc.id,
        'Your quote has expired',
        `The quote for request #${doc.id} has expired. Please request a new quote to continue.`,
        'quote'
      );
    } catch (notifyError) {
      console.error('[Cron] Failed to send quote-expiry notification:', {
        requestId: doc.id,
        error: notifyError instanceof Error ? notifyError.message : String(notifyError),
      });
    }

    expired++;
  }

  return NextResponse.json(
    {
      success: true,
      scanned,
      expired,
      timestamp: new Date(now).toISOString(),
    },
    { status: 200, headers: NO_STORE }
  );
});
