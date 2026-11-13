import { serverEnv } from "@/config/env";
import { createShipINError } from "@/utils/errors";
import { fetchWithTimeout } from "@/lib/http";
import { childLogger } from "@/lib/logger";

const whatsappLog = childLogger({ service: "whatsapp" });

interface SendWhatsAppTemplateParams {
  to: string;
  templateName: string;
  languageCode?: string;
  components?: Array<{
    type: string;
    parameters?: Array<{
      type: string;
      text?: string;
    }>;
  }>;
}

export async function sendWhatsAppTemplate({
  to,
  templateName,
  languageCode = "en_US",
  components = [],
}: SendWhatsAppTemplateParams) {
  const accessToken = serverEnv.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = serverEnv.WHATSAPP_PHONE_NUMBER_ID;
  const apiVersion = serverEnv.WHATSAPP_API_VERSION;

  if (!accessToken) {
    throw createShipINError(
      "WHATSAPP_ACCESS_TOKEN is not configured.",
      "CONFIG_ERROR",
      500
    );
  }

  if (!phoneNumberId) {
    throw createShipINError(
      "WHATSAPP_PHONE_NUMBER_ID is not configured.",
      "CONFIG_ERROR",
      500
    );
  }

  // WhatsApp expects digits only.
  // Example:
  // +91 98765 43210 -> 919876543210
  const recipient = to.replace(/\D/g, "");

  if (!recipient) {
    throw createShipINError(
      "A valid WhatsApp recipient number is required.",
      "VALIDATION_ERROR",
      400
    );
  }

  const response = await fetchWithTimeout(
    `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`,
    {
      method: "POST",

      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },

      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: recipient,

        type: "template",

        template: {
          name: templateName,

          language: {
            code: languageCode,
          },

          ...(components.length > 0
            ? { components }
            : {}),
        },
      }),
    }
  );

  const data = await response.json();

  if (!response.ok) {
    whatsappLog.error("WhatsApp API error", { status: response.status, data });

    throw createShipINError(
      data?.error?.message ||
        "Failed to send WhatsApp message.",
      "EXTERNAL_SERVICE_ERROR",
      502
    );
  }

  return data;
}