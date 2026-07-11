import { NextResponse } from "next/server";

import {
  getPayPalAccessToken,
  PAYPAL_BASE,
} from "@/lib/paypal";

import {
  createNotification,
  getRequestById,
  markRequestPaid,
} from "@/lib/firestore";

export async function POST(req: Request) {
  try {
    const {
      requestId,
      orderID,
    } = await req.json();

    const token =
      await getPayPalAccessToken();

    const response = await fetch(
      `${PAYPAL_BASE}/v2/checkout/orders/${orderID}/capture`,
      {
        method: "POST",

        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      }
    );

    const result = await response.json();

    if (result.status !== "COMPLETED") {
      return NextResponse.json(
        {
          error: "Payment not completed.",
        },
        {
          status: 400,
        }
      );
    }

    const request =
      await getRequestById(requestId);

    if (!request) {
      return NextResponse.json(
        {
          error: "Request not found.",
        },
        {
          status: 404,
        }
      );
    }

    await markRequestPaid(requestId, {
      orderId: orderID,
      captureId:
        result.purchase_units?.[0]?.payments
          ?.captures?.[0]?.id,
      amount:
        request.quote?.breakdown.grandTotal ??
        0,
    });

    await createNotification(
      request.userId,
      request.id,
      "Payment Received",
      "We've received your payment and will begin purchasing your products.",
      "payment"
    );

    return NextResponse.json({
      success: true,
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        error:
          "Unable to capture payment.",
      },
      {
        status: 500,
      }
    );
  }
}