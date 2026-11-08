import "server-only";

import { adminDb } from "@/lib/firebaseAdmin";
import { NotFoundError } from "@/utils/errors";
import { FieldValue } from "firebase-admin/firestore";
import type { Request } from "@/types/request";
import { sendNotification } from "@/features/notifications/services/notificationService";
import type { NotificationCategory } from "@/features/notifications/services/notificationService";

interface RequestNewQuoteParams {
  requestId: string;
}

interface RequestNewQuoteContext {
  requestId: string;
  userId: string;
  customerName: string;
}

export async function requestNewQuoteToRequest({
  requestId,
}: RequestNewQuoteParams): Promise<RequestNewQuoteContext> {
  const requestRef = adminDb.collection("requests").doc(requestId);
  const snapshot = await requestRef.get();

  if (!snapshot.exists) {
    throw new NotFoundError('Request');
  }

  const requestData = snapshot.data();
  if (!requestData) {
    throw new NotFoundError('Request data');
  }

  await requestRef.update({
    status: "quote_requested",
    quoteRegenerationRequested: true,
    quoteRequestedAt: FieldValue.serverTimestamp(),
  });

  const customerName =
    requestData.customerName ||
    (requestData.shippingAddress as { firstName?: string })?.firstName ||
    "Customer";

  return {
    requestId,
    userId: requestData.userId,
    customerName,
  };
}

export function quoteRequestedNotificationPayload({
  customerName,
  requestId,
}: RequestNewQuoteContext) {
  return {
    userId: "",
    requestId,
    title: "Quote Request Received",
    message: "We’ve received your request for a new quote.",
    type: "quote",
    category: "quote" as NotificationCategory,
    channels: {
      inApp: true,
      email: false,
      whatsapp: false,
    },
    customerName,
  };
}

export async function requestNewQuoteAndNotify({
  requestId,
}: RequestNewQuoteParams) {
  const context = await requestNewQuoteToRequest({ requestId });
  const notification = quoteRequestedNotificationPayload(context);

  try {
    await sendNotification(notification);
  } catch (error) {
    console.error("Quote-requested notification failed:", error);
  }

  return context;
}

