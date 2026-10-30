const PAYPAL_BASE =
  process.env.PAYPAL_ENV === "live"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";

export { PAYPAL_BASE };

/*
 * PayPal OAuth token exchange — SERVER ONLY.
 *
 * This module MUST NOT be imported in client components.
 * It is imported only by Next.js server-side route
 * handlers (API routes), so process.env is not bundled
 * to the browser.
 *
 * SECURITY: Uses PAYPAL_CLIENT_ID + PAYPAL_CLIENT_SECRET
 * (server-only vars).  Never use NEXT_PUBLIC_* here —
 * those would be bundled into client JS and leak the
 * secret.
 */
export async function getPayPalAccessToken() {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error(
      "PayPal credentials are not configured."
    );
  }

  const auth = Buffer.from(
    `${clientId}:${clientSecret}`
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
    throw new Error(
      "Unable to authenticate with PayPal."
    );
  }

  const data = await response.json();

  return data.access_token as string;
}

/*
 * Verify a captured PayPal order.
 * SERVER ONLY — must not be imported in client code.
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
