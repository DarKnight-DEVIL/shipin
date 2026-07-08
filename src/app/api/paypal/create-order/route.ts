import { NextResponse } from "next/server";

async function getAccessToken() {
  const auth = Buffer.from(
    `${process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`
  ).toString("base64");

  const response = await fetch(
    "https://api-m.sandbox.paypal.com/v1/oauth2/token",
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
    }
  );

  const data = await response.json();

  if (!data.access_token) {
    throw new Error(
      `Failed to get access token: ${JSON.stringify(data)}`
    );
  }

  return data.access_token;
}

export async function POST(req: Request) {
  try {
    const { amount } = await req.json();

    const numericAmount = Number(amount);

    if (!amount || isNaN(numericAmount) || numericAmount <= 0) {
      return NextResponse.json(
        { error: `Invalid amount received: ${amount}` },
        { status: 400 }
      );
    }

    const accessToken = await getAccessToken();

    const response = await fetch(
      "https://api-m.sandbox.paypal.com/v2/checkout/orders",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          intent: "CAPTURE",
          purchase_units: [
            {
              amount: {
                currency_code: "USD",
                value: numericAmount.toFixed(2),
              },
            },
          ],
        }),
      }
    );

    const data = await response.json();

    if (!response.ok || !data.id) {
      console.error("PayPal create-order failed:", data);
      return NextResponse.json(
        { error: "PayPal order creation failed", details: data },
        { status: 500 }
      );
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        error: "Failed to create PayPal order",
      },
      {
        status: 500,
      }
    );
  }
}