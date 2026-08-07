import { NextRequest, NextResponse } from "next/server";

import {
  getRequestById,
  recordPayment,
} from "@/lib/firestore";
import { verifyPayPalOrder } from "@/lib/paypal";

export async function POST(req: NextRequest) {
  try {
    const {
      requestId,
      orderID,
      amount,
    } = await req.json();

    if (!requestId || !orderID || !amount) {
      return NextResponse.json(
        {
          error: "Missing required fields",
        },
        {
          status: 400,
        }
      );
    }

    const request = await getRequestById(requestId);

    if (!request) {
      return NextResponse.json(
        {
          error: "Request not found",
        },
        {
          status: 404,
        }
      );
    }

    const paypalOrder =
      await verifyPayPalOrder(orderID);

    const expected =
      request.quote?.breakdown.grandTotal ?? 0;

    if (Math.abs(expected - amount) > 0.01) {
      return NextResponse.json(
        {
          error: "Amount mismatch",
        },
        {
          status: 400,
        }
      );
    }

    if (paypalOrder.status !== "COMPLETED") {
      return NextResponse.json(
        {
          error: "Payment has not completed.",
        },
        {
          status: 400,
        }
      );
    }

    const purchaseUnit =
      paypalOrder.purchase_units?.[0];

    const captured =
      purchaseUnit?.payments?.captures?.[0];

    if (!captured) {
      return NextResponse.json(
        {
          error: "Capture not found.",
        },
        {
          status: 400,
        }
      );
    }

    const paidAmount =
      Number(captured.amount.value);

    if (Math.abs(paidAmount - amount) > 0.01) {
      return NextResponse.json(
        {
          error: "PayPal amount mismatch.",
        },
        {
          status: 400,
        }
      );
    }

    await recordPayment(requestId, {
      provider: "paypal",
      orderId: orderID,
      captureId: captured.id,
      amount,
    });

    return NextResponse.json({
      success: true,
    });
  } catch (err) {
    console.error(err);

    return NextResponse.json(
      {
        error: "Internal Server Error",
      },
      {
        status: 500,
      }
    );
  }
}