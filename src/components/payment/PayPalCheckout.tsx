"use client";

import { PayPalButtons } from "@paypal/react-paypal-js";
import { toast } from "sonner";

import { paymentService } from "@/features/payment/services/paymentService";

type PaymentType = "main" | "additional_item";

interface Props {
  requestId: string;
  amount: number;
  paymentType?: PaymentType;
  additionalItemRequestId?: string;
  onSuccess?: () => Promise<void> | void;
  onError?: (error: unknown) => void;
  disabled?: boolean;
}

export default function PayPalCheckout({
  requestId,
  amount,
  paymentType = "main",
  additionalItemRequestId,
  onSuccess,
  onError,
  disabled = false,
}: Props) {
  if (amount <= 0) {
    return null;
  }

  return (
    <div className="space-y-3">
      <PayPalButtons
        disabled={disabled}
        forceReRender={[
          amount,
          requestId,
          paymentType,
          additionalItemRequestId ?? "",
        ]}
        style={{
          layout: "vertical",
          color: "gold",
          shape: "rect",
          label: "paypal",
          height: 50,
          disableMaxWidth: true,
        }}
        createOrder={async () => {
          try {
            /*
             * The amount passed into this component is the
             * amount PayPal is actually supposed to collect.
             *
             * For a wallet + PayPal payment this is NOT the
             * original quotation grand total.
             *
             * Example:
             *
             * Quote total:       $100.00
             * PayPal fee:          $4.92
             * Total required:    $104.92
             * Wallet applied:   -$100.00
             * PayPal amount:       $4.92
             *
             * Therefore we explicitly pass `amount`.
             */

            const order =
              await paymentService.createPayPalOrder(
                requestId,
                amount,
                paymentType,
                additionalItemRequestId
              );

            if (!order?.id) {
              throw new Error(
                "PayPal did not return an order ID."
              );
            }

            return order.id;
          } catch (err) {
            console.error(
              "PayPal create order error:",
              err
            );

            throw err;
          }
        }}
        onApprove={async (data) => {
          try {
            /*
             * Pass the amount through to the capture
             * service as well.
             *
             * The server will NOT blindly trust this amount.
             * It will verify it against the request,
             * wallet state and PayPal order.
             */

            await paymentService.capturePayPalOrder(
              requestId,
              data.orderID,
              amount,
              paymentType,
              additionalItemRequestId
            );

            if (onSuccess) {
              await onSuccess();
            }
          } catch (err) {
            console.error(
              "PayPal capture error:",
              err
            );

            toast.error(
              "Payment completed, but we couldn't finalize it.",
              {
                description:
                  "Please refresh the page. If the issue persists, contact support.",
              }
            );

            if (onError) {
              onError(err);
            }
          }
        }}
        onError={(err) => {
          console.error(
            "PayPal checkout error:",
            err
          );

          if (onError) {
            onError(err);
          } else {
            toast.error(
              "Unable to process PayPal payment.",
              {
                description:
                  "Please try again or choose another payment method.",
              }
            );
          }
        }}
      />
    </div>
  );
}