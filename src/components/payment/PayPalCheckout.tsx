"use client";

import {
  PayPalButtons,
} from "@paypal/react-paypal-js";
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
        forceReRender={[amount]}
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
            const order =
              await paymentService.createPayPalOrder(
                requestId,
                paymentType,
                additionalItemRequestId
              );
            return order.id;
          } catch (err) {
            console.error(err);
            throw err;
          }
        }}

        onApprove={async (data) => {
          try {

            await paymentService.capturePayPalOrder(
              requestId,
              data.orderID,
              paymentType,
              additionalItemRequestId
            );

            if (onSuccess) {
              await onSuccess();
            }

          } catch (err) {

            console.error(err);

            toast.error("Payment completed, but we couldn't finalize it.", {
              description:
                "Please refresh the page. If the issue persists, contact support.",
            });

          }
        }}

        onError={(err) => {

          console.error(err);

          if (onError) {
            onError(err);
          } else {
            toast.error("Unable to process PayPal payment.", {
              description:
                "Please try again or choose another payment method.",
            });
          }

        }}
      />

    </div>
  );
}