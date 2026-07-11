"use client";

import {
  PayPalButtons,
  PayPalScriptProvider,
} from "@paypal/react-paypal-js";

interface Props {
  requestId: string;
  amount: number;
}

export default function PayPalCheckout({
  requestId,
  amount,
}: Props) {
  return (
    <PayPalScriptProvider
      options={{
        clientId:
          process.env
            .NEXT_PUBLIC_PAYPAL_CLIENT_ID!,
        currency: "USD",
      }}
    >
      <PayPalButtons
        createOrder={async () => {
          const res = await fetch(
            "/api/paypal/create-order",
            {
              method: "POST",
              headers: {
                "Content-Type":
                  "application/json",
              },
              body: JSON.stringify({
                requestId,
              }),
            }
          );

          const data =
            await res.json();

          return data.orderID;
        }}
        onApprove={async (data) => {
          await fetch(
            "/api/paypal/capture-order",
            {
              method: "POST",
              headers: {
                "Content-Type":
                  "application/json",
              },
              body: JSON.stringify({
                requestId,
                orderID: data.orderID,
              }),
            }
          );

          alert(
            "Payment Successful!"
          );

          location.reload();
        }}
      />
    </PayPalScriptProvider>
  );
}