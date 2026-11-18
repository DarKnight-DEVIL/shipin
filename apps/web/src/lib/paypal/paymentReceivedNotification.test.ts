import { describe, it, expect } from "vitest";

import { WHATSAPP_TEMPLATES } from "@/features/notifications/templates";

import { buildPaymentReceivedNotification } from "./paymentReceivedNotification";

describe("buildPaymentReceivedNotification", () => {
  it("carries the payment category on every channel", () => {
    const notification = buildPaymentReceivedNotification({
      userId: "user-1",
      requestId: "req-1",
      customerName: "Ada",
    });

    expect(notification).toMatchObject({
      userId: "user-1",
      requestId: "req-1",
      type: "payment",
      category: "payment",
      channels: { inApp: true, email: true, whatsapp: true },
    });
  });

  it("fills the WhatsApp template with the customer name, then the request", () => {
    const { whatsapp } = buildPaymentReceivedNotification({
      userId: "user-1",
      requestId: "req-1",
      customerName: "Ada",
    });

    expect(whatsapp.templateName).toBe(WHATSAPP_TEMPLATES.paymentReceived);
    expect(whatsapp.languageCode).toBe("en");
    expect(whatsapp.components).toEqual([
      {
        type: "body",
        parameters: [
          { type: "text", text: "Ada" },
          { type: "text", text: "req-1" },
        ],
      },
    ]);
  });
});
