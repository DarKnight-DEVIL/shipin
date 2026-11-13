import "server-only";

import { adminDb } from '@/lib/firebaseAdmin';
import { FieldValue } from 'firebase-admin/firestore';
import { NotFoundError } from '@/utils/errors';

interface ShipmentDetails {
  internalTrackingId: string;
  carrier: string;
  trackingNumber: string;
  estimatedDelivery?: Date | null;
  trackingUrl?: string;
  createdAt: Date;
}

/**
 * Save shipment details for a request.
 * Called by admin ShipmentPanel when saving tracking info.
 */
export async function saveShipmentDetails(
  requestId: string,
  details: ShipmentDetails
): Promise<void> {
  const requestRef = adminDb.collection('requests').doc(requestId);
  const snapshot = await requestRef.get();

  if (!snapshot.exists) {
    throw new NotFoundError('Request');
  }

  await requestRef.update({
    tracking: {
      internalTrackingId: details.internalTrackingId,
      carrier: details.carrier,
      trackingNumber: details.trackingNumber,
      estimatedDelivery: details.estimatedDelivery ?? null,
      trackingUrl: details.trackingUrl ?? '',
      createdAt: details.createdAt,
    },
    updatedAt: FieldValue.serverTimestamp(),
  });
}

/**
 * Update shipment status for a request.
 * Called by admin panels when advancing workflow status.
 */
export async function updateShipmentStatus(
  requestId: string,
  status: string
): Promise<void> {
  const requestRef = adminDb.collection('requests').doc(requestId);
  const snapshot = await requestRef.get();

  if (!snapshot.exists) {
    throw new NotFoundError('Request');
  }

  await requestRef.update({
    status,
    [`statusHistory.${status}`]: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
}
