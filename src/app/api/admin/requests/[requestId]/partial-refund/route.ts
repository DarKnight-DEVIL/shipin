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
    /*
     * ========================================
     * ADMIN AUTHORIZATION
     * ========================================
     */

    const admin = await requireAdmin(req);

    /*
     * ========================================
     * REQUEST ID
     * ========================================
     */

    const { requestId } = await params;

    if (!requestId) {
      return NextResponse.json(
        {
          success: false,
          error: "Request ID is required.",
        },
        { status: 400 }
      );
    }

    /*
     * ========================================
     * READ REQUEST
     * ========================================
     */

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

    /*
     * ========================================
     * PAYMENT
     * ========================================
     */

    const payment = request?.payment;

    if (!payment) {
      return NextResponse.json(
        {
          success: false,
          error: "No payment was found for this request.",
        },
        { status: 400 }
      );
    }

    const totalPaid = Number(
      payment.amountPaid ??
        payment.amount ??
        0
    );

    if (
      !Number.isFinite(totalPaid) ||
      totalPaid <= 0
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid payment amount.",
        },
        { status: 400 }
      );
    }

    /*
     * ========================================
     * REQUEST BODY
     * ========================================
     *
     * Admin only provides:
     *
     * - amount
     * - reason
     *
     * The refund method is selected later
     * by the customer.
     */

    const body = await req.json();

    const amount = Number(body.amount);

    const reason =
      typeof body.reason === "string"
        ? body.reason.trim()
        : "";

    /*
     * ========================================
     * VALIDATE AMOUNT
     * ========================================
     */

    if (
      !Number.isFinite(amount) ||
      amount <= 0
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "Enter a valid refund amount.",
        },
        { status: 400 }
      );
    }

    const roundedAmount =
      Number(amount.toFixed(2));

    /*
     * ========================================
     * VALIDATE REASON
     * ========================================
     */

    if (!reason) {
      return NextResponse.json(
        {
          success: false,
          error: "A refund reason is required.",
        },
        { status: 400 }
      );
    }

    /*
     * ========================================
     * EXISTING REFUNDS
     * ========================================
     *
     * Only ACTUAL completed refunds count
     * against the refundable balance.
     */

    const previousRefundedAmount =
      Number(
        request?.totalRefundedAmount ?? 0
      );

    if (
      !Number.isFinite(previousRefundedAmount) ||
      previousRefundedAmount < 0
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid existing refund total.",
        },
        { status: 500 }
      );
    }

    /*
     * ========================================
     * REMAINING REFUNDABLE AMOUNT
     * ========================================
     */

    const remainingRefundable =
      Number(
        (
          totalPaid -
          previousRefundedAmount
        ).toFixed(2)
      );

    if (remainingRefundable <= 0) {
      return NextResponse.json(
        {
          success: false,
          error:
            "The full amount has already been refunded.",
        },
        { status: 400 }
      );
    }

    if (roundedAmount > remainingRefundable) {
      return NextResponse.json(
        {
          success: false,
          error:
            `Only $${remainingRefundable.toFixed(
              2
            )} remains refundable.`,
        },
        { status: 400 }
      );
    }

    /*
     * ========================================
     * CHECK FOR EXISTING ACTIVE OFFER
     * ========================================
     */

    const existingOffer =
      request?.partialRefundOffer;

    if (
      existingOffer &&
      existingOffer.status === "offered"
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "A partial refund offer is already awaiting customer selection.",
        },
        { status: 400 }
      );
    }

    /*
     * ========================================
     * CREATE PARTIAL REFUND OFFER
     * ========================================
     *
     * IMPORTANT:
     *
     * We DO NOT:
     *
     * - choose wallet/original payment
     * - process a refund
     * - increase totalRefundedAmount
     * - create a completed refund
     *
     * The customer chooses the refund method
     * later.
     */

    const offerId =
      adminDb
        .collection("requests")
        .doc()
        .id;

    const partialRefundOffer = {
      id: offerId,

      amount: roundedAmount,

      reason,

      status: "offered",

      createdAt:
        FieldValue.serverTimestamp(),

      createdBy:
        admin.uid,

      createdByEmail:
        admin.email || null,
    };

    /*
     * ========================================
     * SAVE OFFER
     * ========================================
     */

    await requestRef.update({
      partialRefundOffer,

      "statusHistory.partial_refund_offered":
        FieldValue.serverTimestamp(),

      updatedAt:
        FieldValue.serverTimestamp(),
    });

    /*
     * ========================================
     * RESPONSE
     * ========================================
     */

    return NextResponse.json({
      success: true,

      requestId,

      offer: {
        id: offerId,
        amount: roundedAmount,
        reason,
        status: "offered",
      },

      remainingRefundable,
    });
  } catch (error) {
    /*
     * ========================================
     * ADMIN AUTH ERRORS
     * ========================================
     */

    const authError =
      getAdminAuthError(error);

    if (
      authError.status !== 500 ||
      (
        error instanceof Error &&
        [
          "AUTHENTICATION_REQUIRED",
          "INVALID_AUTHENTICATION",
          "USER_PROFILE_NOT_FOUND",
          "ADMIN_ACCESS_REQUIRED",
        ].includes(error.message)
      )
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

    /*
     * ========================================
     * UNKNOWN ERROR
     * ========================================
     */

    console.error(
      "Admin partial refund offer error:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error:
          "Unable to create partial refund offer.",
      },
      { status: 500 }
    );
  }
}