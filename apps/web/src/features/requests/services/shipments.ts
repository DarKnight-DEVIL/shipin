import "server-only";

import { adminDb } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";
import { NotFoundError } from "@/utils/errors";
import { Timestamp } from "firebase-admin/firestore";

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
  const requestRef = adminDb.collection("requests").doc(requestId);
  const snapshot = await requestRef.get();

  if (!snapshot.exists) {
    throw new NotFoundError("Request");
  }

  await requestRef.update({
    tracking: {
      internalTrackingId: details.internalTrackingId,
      carrier: details.carrier,
      trackingNumber: details.trackingNumber,
      // Firestore returns read-back values as Timestamps, and the Request type
      // says Timestamp, so write Timestamps rather than Dates: a Date here
      // reads back as a different type than the one callers were promised.
      estimatedDelivery: details.estimatedDelivery
        ? Timestamp.fromDate(details.estimatedDelivery)
        : null,
      trackingUrl: details.trackingUrl ?? "",
      createdAt: Timestamp.fromDate(details.createdAt),
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
  const requestRef = adminDb.collection("requests").doc(requestId);
  const snapshot = await requestRef.get();

  if (!snapshot.exists) {
    throw new NotFoundError("Request");
  }

  await requestRef.update({
    status,
    [`statusHistory.${status}`]: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
}
