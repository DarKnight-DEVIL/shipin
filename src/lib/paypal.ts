const PAYPAL_BASE =
  process.env.PAYPAL_ENV === "live"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";

export { PAYPAL_BASE };

export async function getPayPalAccessToken() {
  const auth = Buffer.from(
    `${process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`
  ).toString("base64");

  const response = await fetch(
    `${PAYPAL_BASE}/v1/oauth2/token`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type":
          "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
    }
  );

  if (!response.ok) {
    throw new Error("Unable to authenticate with PayPal.");
  }

  const data = await response.json();

  return data.access_token as string;
}

/*
 * Verify a captured PayPal order.
 */
export async function verifyPayPalOrder(
  orderID: string
) {
  const token = await getPayPalAccessToken();

  const response = await fetch(
    `${PAYPAL_BASE}/v2/checkout/orders/${orderID}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    }
  );

  if (!response.ok) {
    throw new Error(
      "Unable to verify PayPal order."
    );
  }

  return response.json();
}