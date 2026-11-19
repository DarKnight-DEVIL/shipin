import { describe, it, expect } from "vitest";

import { WHATSAPP_TEMPLATES } from "@/features/notifications/templates";

import { buildPaymentReceivedNotification } from "./paymentReceivedNotification";

describe("buildPaymentReceivedNotification", () => {
  it("carries the payment_received type on every channel", () => {
    const notification = buildPaymentReceivedNotification({
      userId: "user-1",
      requestId: "req-1",
      customerName: "Ada",
    });

    expect(notification).toMatchObject({
      userId: "user-1",
      requestId: "req-1",
      type: "payment_received",
      channels: { inApp: true, email: true, whatsapp: true },
    });
  });

  it("uses the correct WhatsApp template name", () => {
    const notification = buildPaymentReceivedNotification({
      userId: "user-1",
      requestId: "req-1",
      customerName: "Ada",
    });

    expect(notification.channels.whatsapp).toBe(true);
    expect(WHATSAPP_TEMPLATES.paymentReceived).toBe("shipin_payment_received");
  });
});