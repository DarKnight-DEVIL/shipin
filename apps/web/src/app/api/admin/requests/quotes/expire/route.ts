import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebaseAdmin';
import { withErrorHandler } from '@/utils/errors';
import { isQuoteExpired } from '@/features/requests/services/quoteExpiry';
import { createNotification } from '@/features/notifications/services/server';
import type { Request } from '@/types/request';
import crypto from 'crypto';

const NO_STORE = { 'Cache-Control': 'no-store' } as const;

/**
 * POST /api/admin/requests/quotes/expire
 *
 * Cron-triggered (via GitHub Actions) endpoint that scans all requests with
 * an unexpired quote, marks those whose expiresAt has passed as expired,
 * and notifies the customer.
 *
 * Authenticated by a shared CRON_SECRET Bearer token + timestamp + HMAC signature.
 * The timestamp prevents replay attacks (requests older than 5 min are rejected).
 * The HMAC proves the caller knows the secret without sending it in plaintext.
 */
export const POST = withErrorHandler(async (request: NextRequest) => {
  const cronSecret = process.env.CRON_SECRET;
  const timestampHeader = request.headers.get('x-cron-timestamp');
  const signatureHeader = request.headers.get('x-cron-signature');

  if (!cronSecret) {
    console.error('[Cron] CRON_SECRET not configured');
    return NextResponse.json(
      { success: false, error: 'Cron not configured.', code: 'CONFIG_ERROR' },
      { status: 500, headers: NO_STORE }
    );
  }

  // Authorization: Bearer <cron-secret> (legacy) OR timestamp + HMAC (new)
  // Accept either scheme for backward compatibility.
  let isAuthValid = false;

  // Try new timestamp + HMAC scheme first
  if (timestampHeader && signatureHeader && cronSecret) {
    // Parse and validate timestamp (reject requests older than 5 minutes)
    const requestTime = parseInt(timestampHeader, 10);
    if (!isNaN(requestTime)) {
      const now = Date.now();
      const fiveMinutes = 5 * 60 * 1000;
      if (now - requestTime <= fiveMinutes && requestTime <= now + 60 * 1000) {
        // Verify HMAC signature
        const body = await request.text();
        const payload = `${timestampHeader}|${body}`;
        const expectedSignature = crypto
          .createHmac('sha256', cronSecret)
          .update(payload)
          .digest('hex');

        const providedSig = Buffer.from(signatureHeader, 'hex');
        const expectedSig = Buffer.from(expectedSignature, 'hex');
        if (providedSig.length === expectedSig.length && crypto.timingSafeEqual(providedSig, expectedSig)) {
          isAuthValid = true;
        }
      }
    }
  }

  // Fall back to legacy Bearer token only (no timestamp/HMAC)
  if (!isAuthValid) {
    const authHeader = request.headers.get('authorization');
    if (authHeader && authHeader === `Bearer ${cronSecret}`) {
      isAuthValid = true;
    }
  }

  if (!isAuthValid) {
    // If CRON_SECRET is not configured, reject with 500
    if (!cronSecret) {
      console.error('[Cron] CRON_SECRET not configured');
      return NextResponse.json(
        { success: false, error: 'Cron not configured.', code: 'CONFIG_ERROR' },
        { status: 500, headers: NO_STORE }
      );
    }

    return NextResponse.json(
      { success: false, error: 'Unauthorized.', code: 'UNAUTHORIZED' },
      { status: 401, headers: NO_STORE }
    );
  }

  let scanned = 0;
  let expired = 0;
  const now = Date.now();

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
