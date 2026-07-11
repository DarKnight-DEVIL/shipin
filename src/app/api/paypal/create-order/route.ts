import { NextResponse } from "next/server";

import {
  getPayPalAccessToken,
  PAYPAL_BASE,
} from "@/lib/paypal";

import { getRequestById } from "@/lib/firestore";

export async function POST(req: Request) {
  try {
    const { requestId } = await req.json();

    const request = await getRequestById(requestId);

    if (!request?.quote) {
      return NextResponse.json(
        { error: "Quote not found." },
        { status: 404 }
      );
    }

    const token =
      await getPayPalAccessToken();

    const response = await fetch(
      `${PAYPAL_BASE}/v2/checkout/orders`,
      {
        method: "POST",

        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },

        body: JSON.stringify({
          intent: "CAPTURE",

          purchase_units: [
            {
              reference_id: requestId,

              amount: {
                currency_code: "USD",
                value:
                  request.quote.breakdown.grandTotal.toFixed(
                    2
                  ),
              },
            },
          ],
        }),
      }
    );

    const order = await response.json();

    return NextResponse.json({
      id: order.id,
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        error: "Unable to create PayPal order.",
      },
      {
        status: 500,
      }
    );
  }
}