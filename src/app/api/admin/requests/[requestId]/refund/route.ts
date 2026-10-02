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

    await requireAdmin(req);

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
     * GET REQUEST
     * ========================================
     */

    const requestRef = adminDb
      .collection("requests")
      .doc(requestId);

    const snapshot =
      await requestRef.get();

    if (!snapshot.exists) {
      return NextResponse.json(
        {
          success: false,
          error: "Request not found.",
        },
        { status: 404 }
      );
    }

    const request =
      snapshot.data();

    /*
     * ========================================
     * ADMIN REFUND ELIGIBILITY
     * ========================================
     *
     * This is intentionally different from
     * the customer refund endpoint.
     *
     * ONLY admins can call this endpoint.
     *
     * Admin refunds are available when the
     * order has already reached PURCHASED.
     */

    if (
      request?.status !== "purchased"
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "An admin refund can only be initiated for a purchased request.",
        },
        { status: 400 }
      );
    }

    /*
     * ========================================
     * PREVENT DUPLICATE REFUNDS
     * ========================================
     */

    if (request?.refundRequest) {
      return NextResponse.json(
        {
          success: false,
          error:
            "A refund workflow already exists for this request.",
        },
        { status: 400 }
      );
    }

    /*
     * ========================================
     * GET PAYMENT
     * ========================================
     */

    const payment =
      request?.payment;

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

    /*
     * ========================================
     * CALCULATE AMOUNTS
     * ========================================
     */

    const amount = Number(
      payment.amountPaid ??
        payment.amount ??
        0
    );

    const walletAmount =
      Number(
        payment.walletAmount ?? 0
      );

    const paypalAmount =
      Number(
        payment.paypalAmount ?? 0
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

    if (
      !Number.isFinite(walletAmount) ||
      walletAmount < 0 ||
      !Number.isFinite(paypalAmount) ||
      paypalAmount < 0
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Invalid payment breakdown.",
        },
        { status: 400 }
      );
    }

    /*
     * ========================================
     * CREATE ADMIN REFUND WORKFLOW
     * ========================================
     *
     * The admin is initiating this refund.
     *
     * There is NO customer request involved.
     *
     * We still use the same refundRequest
     * structure so the existing
     * RefundActionCard can process it.
     */

    await requestRef.update({
      status:
        "refund_requested",

      refundRequest: {
        status:
          "requested",

        /*
         * Admin has not selected a destination
         * yet.
         *
         * The next admin step will determine
         * whether this goes to:
         *
         * wallet
         * original_payment
         * original_sources
         */
        preference:
          "original_sources",

        amount,

        walletAmount:
          walletAmount > 0
            ? walletAmount
            : 0,

        paypalAmount:
          paypalAmount > 0
            ? paypalAmount
            : 0,

        requestedAt:
          FieldValue.serverTimestamp(),

        /*
         * Mark this as admin initiated.
         */
        initiatedBy:
          "admin",
      },

      "statusHistory.refund_requested":
        FieldValue.serverTimestamp(),

      updatedAt:
        FieldValue.serverTimestamp(),
    });

    return NextResponse.json({
      success: true,

      requestId,

      status:
        "refund_requested",

      refundRequest: {
        status:
          "requested",

        amount,

        walletAmount:
          walletAmount > 0
            ? walletAmount
            : 0,

        paypalAmount:
          paypalAmount > 0
            ? paypalAmount
            : 0,
      },
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
        ].includes(
          error.message
        )
      )
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            authError.error,
        },
        {
          status:
            authError.status,
        }
      );
    }

    /*
     * ========================================
     * UNKNOWN ERROR
     * ========================================
     */

    console.error(
      "Admin refund initiation error:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error:
          "Unable to initiate admin refund.",
      },
      { status: 500 }
    );
  }
}