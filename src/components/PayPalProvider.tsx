"use client";

import { PayPalScriptProvider } from "@paypal/react-paypal-js";
import { clientEnv } from "@/config/env";

export default function PayPalProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <PayPalScriptProvider
      options={{
        clientId: clientEnv.NEXT_PUBLIC_PAYPAL_CLIENT_ID,
        currency: "USD",
        disableFunding: "card",
      }}
    >
      {children}
    </PayPalScriptProvider>
  );
}