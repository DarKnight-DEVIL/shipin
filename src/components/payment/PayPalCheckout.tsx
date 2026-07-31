"use client";

import {
  PayPalButtons,
  PayPalScriptProvider,
} from "@paypal/react-paypal-js";

type PaymentType = "main" | "additional_item";

interface Props {
  requestId: string;
  amount: number;
  paymentType?: PaymentType;
  additionalItemRequestId?: string;
  onSuccess?: () => void;
}

export default function PayPalCheckout({
  requestId,
  amount,
  paymentType = "main",
  additionalItemRequestId,
  onSuccess,
}: Props) {
  return (
    <PayPalScriptProvider
      options={{
        clientId: process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID!,
        currency: "USD",
      }}
    >
      <PayPalButtons
        createOrder={async () => {
          const res = await fetch("/api/paypal/create-order", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              requestId,
              paymentType,
              additionalItemRequestId,
            }),
          });

          const data = await res.json();

          if (!res.ok || !data.success || !data.orderId) {
            throw new Error(
              data.error || "Could not start PayPal checkout."
            );
          }

          return data.orderId;
        }}

        onApprove={async (data) => {
          const res = await fetch("/api/paypal/capture-order", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              requestId,
              orderID: data.orderID,
              paymentType,
              additionalItemRequestId,
            }),
          });

          const result = await res.json();

          if (!res.ok || !result.success) {
            throw new Error(
              result.error || "Payment could not be completed."
            );
          }

          alert("Payment Successful!");

          if (onSuccess) {
            onSuccess();
          } else {
            location.reload();
          }
        }}

        onError={(err) => {
          console.error("PayPal checkout error:", err);

          alert(
            "PayPal payment failed. Please try again."
          );
        }}
      />

      <p className="mt-2 text-center text-xs text-slate-500">
        Amount due: ${amount.toFixed(2)} USD
      </p>
    </PayPalScriptProvider>
  );
}