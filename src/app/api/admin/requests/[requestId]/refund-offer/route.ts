import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";

import { adminDb } from "@/lib/firebaseAdmin";
import {
  requireAdmin,
  getAdminAuthError,
} from "@/lib/adminAuth";

export async function POST(
  req: NextRequest,
  {
    params,
  }: {
    params: Promise<{ requestId: string }>;
  }
) {
  try {
    await requireAdmin(req);

    const { requestId } = await params;

    const requestRef = adminDb
      .collection("requests")
      .doc(requestId);

    const snapshot = await requestRef.get();

    if (!snapshot.exists) {
      return NextResponse.json(
        {
          success: false,
          error: "Request not found.",
        },
        { status: 404 }
      );
    }

    const request = snapshot.data();

    console.log(
      "REFUND OFFER REQUEST:",
      requestId,
      request?.status,
      request?.payment
    );

    const body = await req.json();

    const reason =
      typeof body.reason === "string"
        ? body.reason.trim()
        : "";

    if (!reason) {
      return NextResponse.json(
        {
          success: false,
          error:
            "A reason is required to offer a refund.",
        },
        { status: 400 }
      );
    }

    if (request?.status !== "purchased") {
      return NextResponse.json(
        {
          success: false,
          error:
            "A refund can only be offered after the order has been purchased.",
        },
        { status: 400 }
      );
    }

    if (request?.refundRequest) {
      return NextResponse.json(
        {
          success: false,
          error:
            "A refund request already exists.",
        },
        { status: 400 }
      );
    }

    if (request?.refundOffer?.offered) {
      return NextResponse.json(
        {
          success: false,
          error:
            "A refund has already been offered.",
        },
        { status: 400 }
      );
    }

    /*
     * ========================================
     * REFUND AMOUNT
     * ========================================
     *
     * Use the same amount that the existing
     * refund workflow uses.
     */

    const payment = request?.payment;

    if (!payment) {
      return NextResponse.json(
        {
          success: false,
          error:
            "No payment was found for this request.",
        },
        { status: 400 }
      );
    }

    const amount = Number(
      payment.amountPaid ??
        payment.amount ??
        0
    );

    if (
      !Number.isFinite(amount) ||
      amount <= 0
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Invalid payment amount.",
        },
        { status: 400 }
      );
    }

    /*
     * ========================================
     * RECORD REFUND OFFER
     * ========================================
     */

    console.log(
      "WRITING REFUND OFFER:",
      {
        requestId,
        reason,
        amount,
      }
    );

    await requestRef.update({
      status: "refund_offered",

      refundOffer: {
        offered: true,
        reason,
        amount,
        offeredAt:
          FieldValue.serverTimestamp(),
      },

      "statusHistory.refund_offered":
        FieldValue.serverTimestamp(),

      updatedAt:
        FieldValue.serverTimestamp(),
    });

    console.log(
      "REFUND OFFER WRITTEN:",
      requestId
    );

    return NextResponse.json({
      success: true,
      requestId,
      status: "refund_offered",
      refundOffer: {
        amount,
        reason,
      },
    });
  } catch (error) {
    const authError =
      getAdminAuthError(error);

    if (
      authError.status !== 500 ||
      (error instanceof Error &&
        [
          "AUTHENTICATION_REQUIRED",
          "INVALID_AUTHENTICATION",
          "USER_PROFILE_NOT_FOUND",
          "ADMIN_ACCESS_REQUIRED",
        ].includes(error.message))
    ) {
      return NextResponse.json(
        {
          success: false,
          error: authError.error,
        },
        {
          status: authError.status,
        }
      );
    }

    console.error(
      "Admin refund offer error:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error:
          "Unable to offer refund.",
      },
      { status: 500 }
    );
  }
}