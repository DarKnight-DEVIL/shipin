import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";

export async function POST(
  req: NextRequest,
  {
    params,
  }: {
    params: Promise<{ requestId: string }>;
  }
) {
  try {
    const { requestId } = await params;

    const body = await req.json();

    const preference = body.preference;

    const initiatedBy =
      body.initiatedBy === "admin"
        ? "admin"
        : "customer";

    /*
     * ========================================
     * VALIDATE REFUND PREFERENCE
     * ========================================
     */

    if (
      preference !== "wallet" &&
      preference !== "original_payment" &&
      preference !== "original_sources"
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid refund preference.",
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
     * REFUND ELIGIBILITY
     * ========================================
     *
     * Customer refunds can be requested after payment
     * ("paid") or if an admin offered a refund ("refund_offered").
     *
     * Admin refunds can only be initiated after
     * the order has been purchased ("purchased").
     */

    if (
      initiatedBy === "customer" &&
      request?.status !== "paid" &&
      request?.status !== "refund_offered"
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "A refund can only be requested after payment or after a refund has been offered by our support team.",
        },
        { status: 400 }
      );
    }

    if (
      initiatedBy === "admin" &&
      request?.status !== "purchased"
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Admin refunds can only be initiated after the order has been purchased.",
        },
        { status: 400 }
      );
    }

    /*
     * ========================================
     * PREVENT DUPLICATE REFUND REQUESTS
     * ========================================
     */

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
     * CALCULATE REFUND AMOUNTS
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
     * CREATE REFUND REQUEST
     * ========================================
     *
     * IMPORTANT:
     *
     * The request itself now becomes:
     *
     *     paid / purchased / refund_offered
     *                  ↓
     *           refund_requested
     *
     * while refundRequest.status remains:
     *
     *             requested
     *
     * This lets the admin dashboard sort the
     * request by priority without losing the
     * detailed refund workflow information.
     */

    await requestRef.update({
      /*
       * MAIN REQUEST STATUS
       */
      status:
        "refund_requested",

      /*
       * REFUND DETAILS
       */
      refundRequest: {
        status:
          "requested",

        preference,

        initiatedBy,

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
      },

      /*
       * STATUS HISTORY
       */
      "statusHistory.refund_requested":
        FieldValue.serverTimestamp(),

      /*
       * GENERAL UPDATE TIME
       */
      updatedAt:
        FieldValue.serverTimestamp(),
    });

    /*
     * ========================================
     * SUCCESS
     * ========================================
     */

    return NextResponse.json({
      success: true,

      requestId,

      status:
        "refund_requested",

      refundRequest: {
        status:
          "requested",

        preference,

        initiatedBy,

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
    console.error(
      "Refund request error:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error:
          "Unable to submit refund request.",
      },
      { status: 500 }
    );
  }
}