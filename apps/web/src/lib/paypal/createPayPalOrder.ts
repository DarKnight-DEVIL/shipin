/**
 * Create a PayPal order for a checkout.
 *
 * The purchase unit is the contract with the capture route: `reference_id` and
 * `custom_id` record which request (and, for an add-on, which additional item)
 * the money is for, and the amount is the PayPal share after the wallet part.
 * PayPal's answer is only usable if it carries an order ID, so that is checked
 * here rather than after the payment order has been stored.
 */

import { serverEnv } from "@/config/env";
import { fetchWithTimeout } from "@/lib/http";
import { getPayPalAccessToken } from "@/lib/paypal";

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
}

export type CreatePayPalOrderResult =
  { ok: true; orderId: string } | PaymentFailure;

interface PayPalOrderBody {
  id?: string;
}

export async function createPayPalOrder({
  requestId,
  description,
  paymentType,
  additionalItemRequestId,
  paypalAmount,
  transport = fetchWithTimeout,
}: CreatePayPalOrderInput): Promise<CreatePayPalOrderResult> {
  const accessToken = await getPayPalAccessToken();

  const baseUrl =
    serverEnv.PAYPAL_API_URL ?? "https://api-m.sandbox.paypal.com";

  const paypalResponse = await transport(`${baseUrl}/v2/checkout/orders`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
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
    console.error("PayPal create order error:", paypalData);

    return {
      ok: false,
      status: paypalResponse.status,
      error: "Unable to process payment. Please try again.",
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
