/**
 * Create a PayPal order for a checkout.
 *
 * The purchase unit is the contract with the capture route: `reference_id` and
 * `custom_id` record which request (and, for an add-on, which additional item)
 * the money is for, and the amount is the PayPal share after the wallet part.
 * PayPal's answer is only usable if it carries an order ID, so that is checked
 * here rather than after the payment order has been stored.
 */

import { fetchWithTimeout } from "@/lib/http";
import { getPayPalAccessToken, getPayPalBaseUrl } from "@/lib/paypal";

import type { PaymentFailure, PaymentType } from "./types";

export interface CreatePayPalOrderInput {
  requestId: string;
  description: string;
  paymentType: PaymentType;
  additionalItemRequestId?: string;
  /** What PayPal should collect, already rounded to cents. */
  paypalAmount: number;
  /**
   * Transport, injectable the way the carrier providers take one: tests drive
   * PayPal's answers without mocking `@/lib/http` out from under other suites.
   */
  transport?: typeof fetchWithTimeout;
  /**
   * Optional idempotency key for PayPal's `PayPal-Request-Id` header.
   * If not provided, a deterministic key is generated from requestId, paymentType, and additionalItemRequestId.
   */
  idempotencyKey?: string;
}

export type CreatePayPalOrderResult =
  { ok: true; orderId: string } | (PaymentFailure & { errorCode?: string });

interface PayPalOrderBody {
  id?: string;
  /**
   * PayPal's Orders v2 error body is flat — `{ name, message, details }` — so
   * the code and message are read from the top level first. The nested shape is
   * what older/gateway responses return; both are accepted rather than letting
   * a real `INVALID_REQUEST` show up as `UNKNOWN` in the logs.
   */
  name?: string;
  message?: string;
  error?: {
    name?: string;
    code?: string;
    message?: string;
    details?: unknown[];
  };
}

export async function createPayPalOrder({
  requestId,
  description,
  paymentType,
  additionalItemRequestId,
  paypalAmount,
  transport = fetchWithTimeout,
  idempotencyKey,
}: CreatePayPalOrderInput): Promise<CreatePayPalOrderResult> {
  const accessToken = await getPayPalAccessToken();

  /*
   * One source of truth for the host: getPayPalBaseUrl honours PAYPAL_API_URL
   * and falls back by PAYPAL_ENV. Duplicating the fallback here defaulted to
   * the sandbox host even when PAYPAL_ENV=live, so a deployment that set the
   * env but forgot the URL sent a live token to the sandbox API and broke
   * every checkout.
   */
  const baseUrl = getPayPalBaseUrl();

  // Generate deterministic idempotency key if not provided
  const requestIdempotencyKey =
    idempotencyKey ??
    `${requestId}:${paymentType}:${additionalItemRequestId ?? "main"}`;

  const paypalResponse = await transport(`${baseUrl}/v2/checkout/orders`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "PayPal-Request-Id": requestIdempotencyKey,
    },
    body: JSON.stringify({
      intent: "CAPTURE",
      purchase_units: [
        {
          reference_id:
            paymentType === "additional_item"
              ? `${requestId}:${additionalItemRequestId}`
              : requestId,
          description,
          amount: {
            currency_code: "USD",
            value: paypalAmount.toFixed(2),
          },
          custom_id: JSON.stringify({
            requestId,
            paymentType,
            additionalItemRequestId: additionalItemRequestId || null,
          }),
        },
      ],
    }),
  });

  const paypalData = (await paypalResponse.json()) as PayPalOrderBody;

  if (!paypalResponse.ok) {
    // Include PayPal error code for debugging (sanitized)
    const paypalErrorCode =
      paypalData?.error?.name ||
      paypalData?.error?.code ||
      paypalData?.name ||
      "UNKNOWN";
    const paypalErrorMessage =
      paypalData?.error?.message ||
      paypalData?.message ||
      "Unknown PayPal error";

    console.error("PayPal create order error:", {
      code: paypalErrorCode,
      message: paypalErrorMessage,
      status: paypalResponse.status,
    });

    return {
      ok: false,
      status: paypalResponse.status,
      error: "Unable to process payment. Please try again.",
      // Sanitized error code for client-side handling
      errorCode: paypalErrorCode.replace(/[^A-Z0-9_]/g, "_").substring(0, 50),
    };
  }

  if (!paypalData.id) {
    return {
      ok: false,
      status: 502,
      error: "PayPal did not return an order ID.",
    };
  }

  return { ok: true, orderId: paypalData.id };
}
