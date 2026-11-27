/** `POST /api/paypal/capture-order` — turn a PayPal approval into a paid request.
 *
 * HTTP handler only — all business logic moved to @/lib/paypal services.
 */

import { NextRequest, NextResponse } from "next/server";

import { withErrorHandler } from "@/utils/errors";
import type { DocumentReference } from "firebase-admin/firestore";

import { requireAuthWithProfile } from "@/lib/auth";
import { adminDb } from "@/lib/firebaseAdmin";
import { claimCapture, releaseCaptureClaim } from "@/lib/paypal/captureClaim";
import { capturePayPalPayment } from "@/lib/paypal/capturePayPalPayment";
import {
  settleMainPayment,
  settleAdditionalItemPayment,
} from "@/lib/paypal/settlement";
import { sendNotification } from "@/features/notifications/services/notificationService";
import { buildPaymentReceivedNotification } from "@/lib/paypal/paymentReceivedNotification";
import { roundMoney, sameCents, toNumber } from "@/lib/paypal/amounts";
import { mainPaymentStatusError } from "@/lib/paypal/requestPaymentState";
import { captureOrderBodySchema, readAndValidateBody } from "@/lib/validation";

const fail = (failure: { error: string; status: number }) =>
  NextResponse.json(
    { success: false, error: failure.error },
    { status: failure.status }
  );

export const POST = withErrorHandler(async (request: NextRequest) => {
  // --- 1. Authenticate the caller ---
  const auth = await requireAuthWithProfile(request);
  if (auth instanceof NextResponse) return auth;

  let captureSettled = false;
  let paymentOrderRef: DocumentReference | undefined;

  try {
    const parsed = await readAndValidateBody(request, captureOrderBodySchema);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error },
        { status: 400 }
      );
    }

    const { requestId, orderID, amount, paymentType, additionalItemRequestId } =
      parsed.data;

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
    paymentOrderRef = adminDb.collection("paypalPaymentOrders").doc(orderID);

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

    if (paymentType === "main") {
      const statusError = mainPaymentStatusError(requestData.status);
      if (statusError) {
        return NextResponse.json(
          {
            success: false,
            error: statusError,
            code: "REQUEST_NOT_PAYABLE",
          },
          { status: 409 }
        );
      }
    }

    // --- 8. What the browser paid must be what ShipIN stored ---
    const expectedPayPalAmount = roundMoney(
      toNumber(paymentOrder.paypalAmount)
    );

    if (!sameCents(roundMoney(amount), expectedPayPalAmount)) {
      return NextResponse.json(
        {
          success: false,
          error: "The PayPal payment amount could not be verified.",
        },
        { status: 400 }
      );
    }

    if (roundMoney(paymentOrder.totalRequired) <= 0) {
      return NextResponse.json(
        { success: false, error: "The stored payment calculation is invalid." },
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

    // --- 10. Capture at PayPal ---
    const captured = await capturePayPalPayment({
      orderID,
      requestId,
      expectedPayPalAmount,
    });

    if (!captured.ok)
      return NextResponse.json(
        {
          success: false,
          error:
            captured.error || "Unable to process payment. Please try again.",
        },
        { status: captured.status ?? 400 }
      );

    const { captureId, capturedAmount, capturedCurrency } = captured;

    // --- 11. Settle the payment ---
    // Assigns the flag declared above the try: `finally` reads it, and a
    // redeclaration here would silently keep that one false forever.
    if (paymentType === "additional_item") {
      const settlement = await settleAdditionalItemPayment({
        requestRef,
        paymentOrderRef,
        additionalItemRequestId: additionalItemRequestId as string,
        orderID,
        captureId,
        capturedAmount,
        capturedCurrency,
      });

      if (!settlement.ok)
        return fail({
          error: settlement.error || "Settlement failed",
          status: settlement.status ?? 500,
        });

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

    if (!settlement.ok)
      return fail({
        error: settlement.error || "Settlement failed",
        status: settlement.status ?? 500,
      });

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
  } catch (error) {
    console.error("PayPal capture order route error:", error);

    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  } finally {
    // Every path that did not settle hands the claim back, so the customer can
    // press "pay" again instead of waiting out the lease.
    if (!captureSettled && paymentOrderRef) {
      // A release failure must never replace the response or error the handler
      // already produced, so it is contained here.
      try {
        await releaseCaptureClaim(paymentOrderRef);
      } catch (error) {
        console.error("Could not release the PayPal capture claim:", error);
      }
    }
  }
});
