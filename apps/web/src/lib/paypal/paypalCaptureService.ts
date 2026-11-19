/** PayPal API call + verification logic. */
import { capturePayPalPayment } from "./capturePayPalPayment";
import { roundMoney, toNumber } from "./amounts";

export interface CapturePayPalPaymentResult {
  ok: boolean;
  captured?: {
    captureId: string;
    amount: number;
    currency: string;
  };
  error?: {
    message: string;
    status: number;
  };
}

export async function capturePayPalService({
  orderID,
  requestId,
  expectedPayPalAmount,
}: {
  orderID: string;
  requestId: string;
  expectedPayPalAmount: number;
}): Promise<CapturePayPalPaymentResult> {
  const captured = await capturePayPalPayment({
    orderID,
    requestId,
    expectedPayPalAmount,
  });

  if (!captured.ok) {
    return {
      ok: false,
      error: {
        // `PaymentFailure.error` is the message string itself.
        message: captured.error || "PayPal capture failed",
        status: captured.status ?? 500,
      },
    };
  }

  const { captureId, capturedAmount, capturedCurrency } = captured;

  return {
    ok: true,
    captured: {
      captureId,
      amount: roundMoney(toNumber(capturedAmount)),
      currency: capturedCurrency,
    },
  };
}
