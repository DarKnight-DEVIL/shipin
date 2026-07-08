"use client";

import { PayPalButtons } from "@paypal/react-paypal-js";

export default function TestPaypalButton() {
  return (
    <div className="p-8">
      <PayPalButtons
        fundingSource="card"
        createOrder={(data, actions) => {
          return actions.order.create({
            purchase_units: [
              {
                amount: {
                  value: "10.00",
                },
              },
            ],
          });
        }}
      />
    </div>
  );
}