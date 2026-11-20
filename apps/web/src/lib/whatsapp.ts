import { serverEnv } from "@/config/env";
import { createShipINError } from "@/utils/errors";
import { fetchWithTimeout } from "@/lib/http";
import { childLogger } from "./logger";

const whatsappLog = childLogger({ service: "whatsapp" });

/** One call plus two retries: enough to ride out a Graph API blip. */
const WHATSAPP_MAX_ATTEMPTS = 3;
const WHATSAPP_RETRY_DELAY_MS = 250;

/** 408, 429 and 5xx are worth another attempt; other 4xx are not. */
function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

function sleep(ms: number): Promise<void> {
  return ms > 0
    ? new Promise((resolve) => setTimeout(resolve, ms))
    : Promise.resolve();
}

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

  const url = `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`;
  const init: RequestInit = {
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

        ...(components.length > 0 ? { components } : {}),
      },
    }),
  };

  // A momentary Graph API outage would otherwise drop the notification for
  // good, so transient failures are retried with the same backoff the carrier
  // sync uses. Retrying a send whose connection dropped can repeat a message
  // Meta already queued; a duplicate notification is the cheaper mistake.
  let lastStatus: number | undefined;
  let lastMessage: string | undefined;

  for (let attempt = 0; attempt < WHATSAPP_MAX_ATTEMPTS; attempt += 1) {
    if (attempt > 0) {
      await sleep(WHATSAPP_RETRY_DELAY_MS * 2 ** (attempt - 1));
    }

    let response: Response;
    try {
      response = await fetchWithTimeout(url, init);
    } catch (error) {
      lastStatus = undefined;
      lastMessage = error instanceof Error ? error.message : undefined;
      continue;
    }

    const data = (await response.json().catch(() => null)) as {
      error?: { message?: string };
    } | null;

    if (response.ok) {
      return data;
    }

    lastStatus = response.status;
    lastMessage = data?.error?.message;

    if (!isRetryableStatus(response.status)) {
      break;
    }

    whatsappLog.warn("WhatsApp API transient failure, retrying", {
      status: response.status,
      attempt: attempt + 1,
      maxAttempts: WHATSAPP_MAX_ATTEMPTS,
    });
  }

  whatsappLog.error("WhatsApp API error", {
    status: lastStatus,
    message: lastMessage,
  });

  throw createShipINError(
    lastMessage || "Failed to send WhatsApp message.",
    "EXTERNAL_SERVICE_ERROR",
    502
  );
}
