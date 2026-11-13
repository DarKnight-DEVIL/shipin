import { NextRequest, NextResponse } from "next/server";

import {
  getRequestById,
  recordPayment,
} from "@/features/requests/services/requests";
import { verifyPayPalOrder } from "@/lib/paypal";
import { requireAuthWithProfile } from "@/lib/auth";
import { withErrorHandler } from "@/utils/errors";

/**
 * POST /api/paypal/complete-payment
 *
 * Requires an authenticated customer who OWNS the request.
 * Previously this endpoint had no auth at all — any caller could
 * mark any request as paid. Now the caller's Firebase token is
 * verified and matched against request.userId.
 */
export const POST = withErrorHandler(async (req: NextRequest) => {
  // --- 1. Authenticate the caller ---
  const auth = await requireAuthWithProfile(req);
  if (auth instanceof NextResponse) return auth;

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

    // --- 2. Ownership check: only the request owner may complete payment ---
    if (request.userId !== auth.profile.uid) {
      return NextResponse.json(
        {
          error: "You do not have permission to update this request.",
        },
        {
          status: 403,
        }
      );
    }

    const paypalOrder = (await verifyPayPalOrder(orderID)) as {
    status: string;
    purchase_units?: Array<{ payments?: { captures?: Array<unknown> } }>;
  };

    const expected =
      request.quote?.breakdown.grandTotal ?? 0;

    if (Math.round(Math.abs(expected - amount) * 100) > 1) {
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

    const captured = (purchaseUnit?.payments?.captures?.[0]) as {
      amount: { value: string };
      id: string;
    } | undefined;

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

    if (Math.round(Math.abs(paidAmount - amount) * 100) > 1) {
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
});