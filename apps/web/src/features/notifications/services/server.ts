import { FieldValue } from 'firebase-admin/firestore';

import { adminDb } from '@/lib/firebaseAdmin';
import type { Notification } from '@/types/notification';

/**
 * Server-side notification writer.
 *
 * This module is server-only: it imports the Firebase Admin SDK, so it must
 * never be pulled into the browser bundle. Client code creates notifications
 * through `POST /api/notifications` (see `./index.ts`).
 */
export async function createNotification(
  userId: string,
  requestId: string | null,
  title: string,
  message: string,
  type: Notification['type']
): Promise<string> {
  const docRef = await adminDb.collection('notifications').add({
    userId,
    requestId,
    title,
    message,
    type,
    read: false,
    createdAt: FieldValue.serverTimestamp(),
  });

  return docRef.id;
}
