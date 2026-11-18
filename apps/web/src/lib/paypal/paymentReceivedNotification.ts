/**
 * The "Payment Received" notification, built once for every route that
 * completes a payment.
 *
 * The capture route and the webhook both celebrated a captured payment with the
 * same in-app / email / WhatsApp payload, spelled out twice — including the Meta
 * template name and its two body parameters. A template parameter added or
 * reordered in one copy would have produced a message the other route could not
 * send, so the payload lives here and the callers keep only their own error
 * handling.
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
    userId,
    requestId,

    title: "Payment Received",
    message: "We've received your payment successfully.",
    type: "payment",
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
