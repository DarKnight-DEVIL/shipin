/**
 * Ask PayPal to capture an order and prove the result is the payment ShipIN
 * expects before any money is moved on our side.
 *
 * Everything here is a check on PayPal's answer: the status, the presence of a
 * capture, the capture's amount and currency, and finally the amount against the
 * one stored when the order was created. Each failure returns the same status
 * and message the route used to answer with inline.
 */

import { fetchWithTimeout } from "@/lib/http";
import { getPayPalAccessToken } from "@/lib/paypal";

import { sameCents } from "./amounts";
import type { PaymentFailure } from "./types";

interface PayPalCaptureBody {
  status?: string;
  purchase_units?: Array<{
    payments?: {
      captures?: Array<{
        id?: string;
        amount?: { value?: string; currency_code?: string };
      }>;
    };
  }>;
}

export interface CapturePayPalPaymentInput {
  orderID: string;
  requestId: string;
  /** The amount stored on the payment order when it was created. */
  expectedPayPalAmount: number;
  /**
   * Transport, injectable the way the carrier providers take one: tests drive
   * PayPal's answers without mocking `@/lib/http` out from under other suites.
   */
  transport?: typeof fetchWithTimeout;
}

export type CapturePayPalPaymentResult =
  | {
      ok: true;
      captureId: string;
      capturedAmount: number;
      capturedCurrency: string;
    }
  | PaymentFailure;

export async function capturePayPalPayment({
  orderID,
  requestId,
  expectedPayPalAmount,
  transport = fetchWithTimeout,
}: CapturePayPalPaymentInput): Promise<CapturePayPalPaymentResult> {
  const accessToken = await getPayPalAccessToken();

  const baseUrl =
    process.env.PAYPAL_API_URL || "https://api-m.sandbox.paypal.com";

  const paypalResponse = await transport(
    `${baseUrl}/v2/checkout/orders/${orderID}/capture`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    }
  );

  const paypalData = (await paypalResponse.json()) as PayPalCaptureBody;

  if (!paypalResponse.ok) {
    console.error("PayPal capture error:", paypalData);

    return {
      ok: false,
      status: paypalResponse.status,
      error: "Unable to process payment. Please try again.",
    };
  }

  if (paypalData.status !== "COMPLETED") {
    return {
      ok: false,
      status: 400,
      error: "PayPal payment was not completed.",
    };
  }

  const capture = paypalData.purchase_units?.[0]?.payments?.captures?.[0];

  if (!capture) {
    return {
      ok: false,
      status: 400,
      error: "PayPal capture details were not found.",
    };
  }

  const captureId = capture.id;

  if (!captureId) {
    return {
      ok: false,
      status: 400,
      error: "PayPal capture ID was not found.",
    };
  }

  const capturedAmount = Number(capture.amount?.value);
  const capturedCurrency = capture.amount?.currency_code;

  if (!Number.isFinite(capturedAmount) || capturedAmount <= 0) {
    return {
      ok: false,
      status: 400,
      error: "Invalid PayPal capture amount.",
    };
  }

  if (capturedCurrency !== "USD") {
    return {
      ok: false,
      status: 400,
      error: "Unexpected PayPal payment currency.",
    };
  }

  if (!sameCents(capturedAmount, expectedPayPalAmount)) {
    console.error("PayPal capture amount mismatch:", {
      expectedPayPalAmount,
      capturedAmount,
      orderID,
      requestId,
    });

    return {
      ok: false,
      status: 400,
      error:
        "Captured payment amount does not match the expected PayPal payment.",
    };
  }

  return { ok: true, captureId, capturedAmount, capturedCurrency };
}
