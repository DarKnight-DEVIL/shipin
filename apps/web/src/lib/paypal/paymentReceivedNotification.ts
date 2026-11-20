/**
 * The "Payment Received" notification, built once for every route that
 * completes a payment.
 *
 * The capture route and the webhook both celebrate a captured payment with the
 * same in-app / email / WhatsApp payload, including the Meta template name and
 * its two body parameters, so the payload lives here and the callers keep only
 * their own error handling.
 */

import { WHATSAPP_TEMPLATES } from "@/features/notifications/templates";

export interface PaymentReceivedNotificationInput {
  userId: string;
  requestId: string;
  /** Shown as the first WhatsApp template parameter. */
  customerName: string;
}

export function buildPaymentReceivedNotification({
  userId,
  requestId,
  customerName,
}: PaymentReceivedNotificationInput) {
  return {
    type: "payment_received",
    userId,
    requestId,
    customerName,
    title: "Payment received",
    message: "A payment has been received",
    timestamp: new Date().toISOString(),
    category: "payment" as const,

    channels: { inApp: true, email: true, whatsapp: true },

    whatsapp: {
      templateName: WHATSAPP_TEMPLATES.paymentReceived,
      languageCode: "en",
      components: [
        {
          type: "body",
          parameters: [
            { type: "text", text: customerName },
            { type: "text", text: requestId },
          ],
        },
      ],
    },
  };
}
