/** Payment notification logic. */
import { sendNotification } from "@/features/notifications/services/notificationService";
import { buildPaymentReceivedNotification } from "./paymentReceivedNotification";

export interface NotificationResult {
  ok: boolean;
  error?: {
    message: string;
    status: number;
  };
}

/** Send payment received notification to the customer. */
export async function sendPaymentNotification({
  userId,
  requestId,
  customerName,
}: {
  userId: string;
  requestId: string;
  customerName: string;
}): Promise<NotificationResult> {
  try {
    const notification = buildPaymentReceivedNotification({
      userId,
      requestId,
      customerName,
    });

    await sendNotification(notification);

    return { ok: true };
  } catch (error) {
    console.error("Payment notification error:", error);
    return {
      ok: false,
      error: {
        message: error instanceof Error ? error.message : "Failed to send payment notification",
        status: 500,
      },
    };
  }
}