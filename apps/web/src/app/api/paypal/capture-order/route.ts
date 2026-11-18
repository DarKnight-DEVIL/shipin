/**
 * `POST /api/paypal/capture-order` — turn a PayPal approval into a paid request.
 *
 * The handler is the sequence, not the arithmetic: authenticate, validate the
 * body, prove this caller owns this payment, claim the capture, ask PayPal, then
 * settle. Each step lives in `@/lib/paypal` so it can be tested without a
 * request; this file decides the order and turns failures into responses.
 *
 * The order matters and must not be rearranged:
 *
 * 1. Ownership before anything is captured — a valid order ID for someone
 *    else's request must not become a payment.
 * 2. Idempotency before the claim — an already-paid order answers without
 *    touching PayPal.
 * 3. The claim before the capture call — two concurrent retries must not both
 *    ask PayPal to capture.
 * 4. Settlement after PayPal confirms — money only moves on a verified capture.
 * 5. The claim is released on every path that did not settle, so a failed
 *    attempt can be retried.
 */

import { NextRequest, NextResponse } from "next/server";

import { sendNotification } from "@/features/notifications/services/notificationService";
import { requireAuthWithProfile } from "@/lib/auth";
import { adminDb } from "@/lib/firebaseAdmin";
import { claimCapture, releaseCaptureClaim } from "@/lib/paypal/captureClaim";
import { capturePayPalPayment } from "@/lib/paypal/capturePayPalPayment";
import { buildPaymentReceivedNotification } from "@/lib/paypal/paymentReceivedNotification";
import { settleAdditionalItemPayment } from "@/lib/paypal/settleAdditionalItemPayment";
import { settleMainPayment } from "@/lib/paypal/settleMainPayment";
import { roundMoney, sameCents, toNumber } from "@/lib/paypal/amounts";
import type { PaymentFailure, PaymentType } from "@/lib/paypal/types";
import { withErrorHandler } from "@/utils/errors";

const fail = (failure: PaymentFailure) =>
  NextResponse.json(
    { success: false, error: failure.error },
    { status: failure.status }
  );

export const POST = withErrorHandler(async (request: NextRequest) => {
  // --- 1. Authenticate the caller ---
  const auth = await requireAuthWithProfile(request);
  if (auth instanceof NextResponse) return auth;

  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: "Invalid JSON body.", code: "INVALID_JSON" },
        { status: 400 }
      );
    }

    const {
      requestId,
      orderID,
      amount,
      paymentType = "main",
      additionalItemRequestId,
    }: {
      requestId?: string;
      orderID?: string;
      amount?: number;
      paymentType?: PaymentType;
      additionalItemRequestId?: string;
    } = body as Record<string, unknown>;

    // --- 2. Validate the body ---
    if (!requestId) {
      return NextResponse.json(
        { success: false, error: "Request ID is required." },
        { status: 400 }
      );
    }

    if (!orderID) {
      return NextResponse.json(
        { success: false, error: "PayPal Order ID is required." },
        { status: 400 }
      );
    }

    if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json(
        { success: false, error: "A valid PayPal payment amount is required." },
        { status: 400 }
      );
    }

    if (paymentType !== "main" && paymentType !== "additional_item") {
      return NextResponse.json(
        { success: false, error: "Invalid payment type." },
        { status: 400 }
      );
    }

    if (paymentType === "additional_item" && !additionalItemRequestId) {
      return NextResponse.json(
        { success: false, error: "Additional item request ID is required." },
        { status: 400 }
      );
    }

    // --- 3. Load the request ---
    const requestRef = adminDb.collection("requests").doc(requestId);
    const requestSnapshot = await requestRef.get();

    if (!requestSnapshot.exists) {
      return NextResponse.json(
        { success: false, error: "Request not found." },
        { status: 404 }
      );
    }

    const requestData = requestSnapshot.data();

    if (!requestData) {
      return NextResponse.json(
        { success: false, error: "Request data not found." },
        { status: 404 }
      );
    }

    // --- 4. Load the payment order ShipIN stored for this PayPal order ---
    const paymentOrderRef = adminDb
      .collection("paypalPaymentOrders")
      .doc(orderID);

    const paymentOrderSnapshot = await paymentOrderRef.get();

    if (!paymentOrderSnapshot.exists) {
      return NextResponse.json(
        {
          success: false,
          error: "PayPal payment order could not be verified.",
        },
        { status: 403 }
      );
    }

    const paymentOrder = paymentOrderSnapshot.data();

    if (!paymentOrder) {
      return NextResponse.json(
        {
          success: false,
          error: "PayPal payment order data could not be verified.",
        },
        { status: 403 }
      );
    }

    // --- 5. The order must be for this request, this payment type, this item ---
    if (paymentOrder.requestId !== requestId) {
      console.error("PayPal request ownership mismatch:", {
        storedRequestId: paymentOrder.requestId,
        requestId,
        orderID,
      });

      return NextResponse.json(
        {
          success: false,
          error: "This payment does not belong to the requested order.",
        },
        { status: 403 }
      );
    }

    if (paymentOrder.paymentType !== paymentType) {
      return NextResponse.json(
        {
          success: false,
          error: "Payment type does not match the PayPal order.",
        },
        { status: 403 }
      );
    }

    if (
      (paymentOrder.additionalItemRequestId || null) !==
      (additionalItemRequestId || null)
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "Additional item payment does not match the PayPal order.",
        },
        { status: 403 }
      );
    }

    // --- 6. …and for this caller ---
    const requestUserId = requestData.userId;
    const paymentOrderUserId = paymentOrder.userId;

    if (
      !requestUserId ||
      !paymentOrderUserId ||
      requestUserId !== paymentOrderUserId ||
      requestUserId !== auth.profile.uid
    ) {
      console.error("PayPal payment ownership mismatch:", {
        requestUserId,
        paymentOrderUserId,
        authUserId: auth.profile.uid,
        requestId,
        orderID,
      });

      return NextResponse.json(
        {
          success: false,
          error: "This payment does not belong to the authenticated account.",
        },
        { status: 403 }
      );
    }

    // --- 7. Idempotency: a completed order is a success, not a second charge ---
    if (paymentOrder.status === "completed") {
      return NextResponse.json({
        success: true,
        alreadyCompleted: true,
        paymentType,
        captureId: paymentOrder.captureId || null,
      });
    }

    // --- 8. What the browser paid must be what ShipIN stored ---
    const expectedPayPalAmount = roundMoney(
      toNumber(paymentOrder.paypalAmount)
    );

    if (!sameCents(roundMoney(amount), expectedPayPalAmount)) {
      console.error("Client PayPal amount mismatch:", {
        clientAmount: roundMoney(amount),
        expectedPayPalAmount,
        requestId,
        orderID,
      });

      return NextResponse.json(
        {
          success: false,
          error: "The PayPal payment amount could not be verified.",
        },
        { status: 400 }
      );
    }

    // --- 9. One attempt at a time ---
    const claim = await claimCapture(paymentOrderRef);

    if (claim === "completed") {
      return NextResponse.json({
        success: true,
        alreadyCompleted: true,
        paymentType,
        captureId: paymentOrder.captureId || null,
      });
    }

    if (claim === "busy") {
      return NextResponse.json(
        {
          success: false,
          inProgress: true,
          error:
            "This payment is already being processed. Please wait a moment and refresh.",
        },
        { status: 409 }
      );
    }

    let captureSettled = false;

    try {
      // --- 10. Capture at PayPal ---
      const captured = await capturePayPalPayment({
        orderID,
        requestId,
        expectedPayPalAmount,
      });

      if (!captured.ok) return fail(captured);

      const { captureId, capturedAmount, capturedCurrency } = captured;

      // --- 11. Settle the payment this order was for ---
      if (paymentType === "additional_item") {
        const settlement = await settleAdditionalItemPayment({
          requestRef,
          paymentOrderRef,
          requestData,
          paymentOrder,
          // Step 2 guarantees an id when the payment type is an add-on.
          additionalItemRequestId: additionalItemRequestId as string,
          orderID,
          captureId,
          capturedAmount,
          capturedCurrency,
        });

        if (!settlement.ok) return fail(settlement);

        captureSettled = true;

        return NextResponse.json({
          success: true,
          paymentType: "additional_item",
          additionalItemRequestId,
          captureId,
          amountPaid: capturedAmount,
          paymentMethod: "paypal",
        });
      }

      const settlement = await settleMainPayment({
        requestRef,
        paymentOrderRef,
        paymentOrder,
        requestId,
        orderID,
        captureId,
        capturedAmount,
        capturedCurrency,
        expectedPayPalAmount,
      });

      if (!settlement.ok) return fail(settlement);

      captureSettled = true;

      // --- 12. Tell the customer; a failed notification must not undo the payment ---
      try {
        await sendNotification(
          buildPaymentReceivedNotification({
            userId: requestData.userId,
            requestId,
            customerName:
              requestData.customerName ||
              requestData.shippingAddress?.firstName ||
              "Customer",
          })
        );
      } catch (error) {
        console.error("Payment notification failed:", error);
      }

      return NextResponse.json({
        success: true,
        paymentType: "main",
        captureId,
        paymentMethod: settlement.paymentMethod,
        paypalAmount: capturedAmount,
        walletAmount: settlement.walletApplied,
        totalAmount: settlement.totalRequired,
      });
    } finally {
      // Every path that did not settle hands the claim back, so the customer can
      // press "pay" again instead of waiting out the lease.
      if (!captureSettled) {
        await releaseCaptureClaim(paymentOrderRef);
      }
    }
  } catch (error) {
    console.error("PayPal capture order route error:", error);

    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
});
