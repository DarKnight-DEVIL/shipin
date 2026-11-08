import "server-only";

import { adminDb } from '@/lib/firebaseAdmin';
import { FieldValue } from 'firebase-admin/firestore';
import { Timestamp } from 'firebase-admin/firestore';
import { NotFoundError, PaymentError } from '@/utils/errors';
import type { Request } from '@/types/request';

/** Convert Firestore Timestamp or Date to JS Date. */
function toDate(val?: Date | Timestamp | string): Date {
  if (!val) return new Date();
  if (val instanceof Date) return val;
  if (val instanceof Timestamp) return val.toDate();
  return new Date(val);
}

/**
 * Save a detailed quote to a request.
 * Called by admin QuotePanel when saving a quote.
 */
export async function saveDetailedQuote(
  requestId: string,
  quote: Request['quote']
): Promise<void> {
  const normalizedQuote = {
    ...quote,
    createdAt: toDate(quote?.createdAt),
    expiresAt: toDate(quote?.expiresAt),
  };

  const requestRef = adminDb.collection('requests').doc(requestId);
  const snapshot = await requestRef.get();

  if (!snapshot.exists) {
    throw new NotFoundError('Request');
  }

  const requestData = snapshot.data();

  await requestRef.update({
    quote: {
      ...normalizedQuote,
      expired: false,
      regeneratedCount: (requestData?.quote?.regeneratedCount ?? 0) + 1,
    },
    status: 'review',
    quoteRegenerationRequested: false,
    quoteRequestedAt: null,
    updatedAt: FieldValue.serverTimestamp(),
  });
}

/**
 * Accept a quote for a request.
 * Called when customer accepts a quote.
 */
export async function acceptQuote(
  requestId: string
): Promise<void> {
  const requestRef = adminDb.collection('requests').doc(requestId);
  const snapshot = await requestRef.get();

  if (!snapshot.exists) {
    throw new NotFoundError('Request');
  }

  const requestData = snapshot.data();
  const quote = requestData?.quote;

  if (!quote || quote.expired) {
    throw new PaymentError('No valid quote to accept');
  }

  await requestRef.update({
    'quote.acceptedAt': FieldValue.serverTimestamp(),
    'quote.expired': false,
    status: 'quote_accepted',
    updatedAt: FieldValue.serverTimestamp(),
  });
}

/**
 * Regenerate a quote for a request.
 * Called when admin needs to regenerate a quote.
 */
export async function regenerateQuote(
  requestId: string,
  quote: Request['quote']
): Promise<void> {
  const normalizedQuote = {
    ...quote,
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    acceptedAt: null,
    expired: false,
  };

  const requestRef = adminDb.collection('requests').doc(requestId);
  const snapshot = await requestRef.get();

  if (!snapshot.exists) {
    throw new NotFoundError('Request');
  }

  const requestData = snapshot.data();

  await requestRef.update({
    quote: {
      ...normalizedQuote,
      regeneratedCount: (requestData?.quote?.regeneratedCount ?? 0) + 1,
    },
    status: 'review',
    quoteRegenerationRequested: true,
    quoteRequestedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
}
