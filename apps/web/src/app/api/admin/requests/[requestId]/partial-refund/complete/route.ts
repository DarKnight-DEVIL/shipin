import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";

import { adminAuth, adminDb } from "@/lib/firebaseAdmin";
import { recordAdminAudit } from "@/lib/adminAudit";

import {
  completePartialRefundBodySchema,
  requestIdSchema,
  validateBody,
} from "@/lib/validation";

import { withErrorHandler, createShipINError } from "@/utils/errors";

function roundMoney(value: number) {
  return Number(value.toFixed(2));
}

export const POST = withErrorHandler(
  async (
    request: NextRequest,
    context: { params: Promise<{ requestId: string }> }
  ) => {
    const authorization = request.headers.get("authorization");

    if (!authorization?.startsWith("Bearer ")) {
      throw createShipINError("Authentication required.", "AUTHENTICATION_REQUIRED", 401);
    }

    const token = authorization.substring(7);
    let admin;
    try {
      admin = await adminAuth.verifyIdToken(token);
    } catch {
      throw createShipINError("Invalid authentication token.", "AUTHENTICATION_REQUIRED", 401);
    }

    /*
     * Validate params (requestId) and body together.
     */
    const validatedParams = requestIdSchema.safeParse(await context.params);
    if (!validatedParams.success) {
      throw createShipINError("Invalid request ID.", "VALIDATION_ERROR", 400);
    }

    const { requestId } = validatedParams.data;

    const parseResult = validateBody(await request.json(), completePartialRefundBodySchema);
    if (!parseResult.success) {
      throw createShipINError("Invalid request body.", "VALIDATION_ERROR", 400);
    }

    const { paypalRefundTransactionId } = parseResult.data;

    const requestRef = adminDb.collection("requests").doc(requestId);
    const snapshot = await requestRef.get();

    if (!snapshot.exists) {
      throw createShipINError("Request not found.", "NOT_FOUND", 404);
    }

    const data = snapshot.data() || {};
    const offer = data.partialRefundOffer;

    if (!offer) {
      throw createShipINError("No partial refund offer exists.", "BAD_REQUEST", 400);
    }

    if (offer.status !== "accepted") {
      throw createShipINError("This partial refund is not awaiting admin processing.", "BAD_REQUEST", 400);
    }

    if (offer.selectedMethod !== "original_payment") {
      throw createShipINError("This offer was not accepted using the original payment method.", "BAD_REQUEST", 400);
    }

    const amount = roundMoney(Number(offer.amount));

    if (!Number.isFinite(amount) || amount <= 0) {
      throw createShipINError("Invalid refund amount.", "BAD_REQUEST", 400);
    }

    const payment = data.payment || {};

    const originalWalletAmount = roundMoney(
      Number(payment.walletAmount ?? 0)
    );

    const originalPaypalAmount = roundMoney(
      Number(payment.paypalAmount ?? 0)
    );

    const walletRefund = Math.min(
      amount,
      Math.max(0, originalWalletAmount)
    );

    const paypalRefund = roundMoney(amount - walletRefund);

    if (paypalRefund > originalPaypalAmount + 0.01) {
      throw createShipINError("The partial refund amount cannot be covered by the original payment sources.", "BAD_REQUEST", 400);
    }

    if (paypalRefund > 0 && !paypalRefundTransactionId) {
      throw createShipINError("PayPal refund transaction ID is required before completing this refund.", "VALIDATION_ERROR", 400);
    }

    const walletTransactionRef = adminDb
      .collection("walletTransactions")
      .doc();

    const partialRefundId = `partial_${requestId}_${Date.now()}`;

    await adminDb.runTransaction(async (transaction) => {
      const currentSnapshot = await transaction.get(requestRef);

      if (!currentSnapshot.exists) {
        throw new Error("Request not found.");
      }

      const currentData = currentSnapshot.data() || {};
      const currentOffer = currentData.partialRefundOffer;

      if (!currentOffer || currentOffer.status !== "accepted") {
        throw new Error("This partial refund has already been processed.");
      }

      if (currentOffer.selectedMethod !== "original_payment") {
        throw new Error(
          "This offer was not accepted using the original payment method."
        );
      }

      const currentPayment = currentData.payment || {};

      const currentWalletAmount = roundMoney(
        Number(currentPayment.walletAmount ?? 0)
      );

      const currentPaypalAmount = roundMoney(
        Number(currentPayment.paypalAmount ?? 0)
      );

      const currentAmount = roundMoney(Number(currentOffer.amount));

      const currentWalletRefund = Math.min(
        currentAmount,
        Math.max(0, currentWalletAmount)
      );

      const currentPaypalRefund = roundMoney(
        currentAmount - currentWalletRefund
      );

      if (currentPaypalRefund > currentPaypalAmount + 0.01) {
        throw new Error("Refund amount exceeds the original payment sources.");
      }

      if (currentPaypalRefund > 0 && !paypalRefundTransactionId) {
        throw new Error("PayPal refund transaction ID is required.");
      }

      let walletTransactionId: string | null = null;

      if (currentWalletRefund > 0) {
        const walletRef = adminDb
          .collection("wallets")
          .doc(currentData.userId);

        const walletSnapshot = await transaction.get(walletRef);

        const currentBalance = walletSnapshot.exists
          ? roundMoney(Number(walletSnapshot.data()?.balance ?? 0))
          : 0;

        const newWalletBalance = roundMoney(
          currentBalance + currentWalletRefund
        );

        transaction.set(
          walletRef,
          {
            balance: newWalletBalance,
            currency: walletSnapshot.exists
              ? walletSnapshot.data()?.currency || "USD"
              : "USD",
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );

        transaction.set(walletTransactionRef, {
          userId: currentData.userId,
          type: "refund",
          amount: currentWalletRefund,
          balanceAfter: newWalletBalance,
          description: currentOffer.reason || "Partial refund",
          requestId,
          createdAt: FieldValue.serverTimestamp(),
          createdBy: admin.uid,
          createdByEmail: admin.email || null,
        });

        walletTransactionId = walletTransactionRef.id;
      }

      const existingRefunds = Array.isArray(currentData.partialRefunds)
        ? currentData.partialRefunds
        : [];

      const previousRefundedAmount = roundMoney(
        Number(currentData.totalRefundedAmount ?? 0)
      );

      const partialRefund = {
        id: partialRefundId,
        amount: currentAmount,
        reason: currentOffer.reason || "",
        method: "original_payment",
        walletRefundAmount: currentWalletRefund,
        paypalRefundAmount: currentPaypalRefund,
        ...(currentPaypalRefund > 0
          ? { paypalRefundTransactionId }
          : {}),
        createdAt: new Date(),
        createdBy: admin.uid,
        createdByEmail: admin.email || null,
      };

      transaction.update(requestRef, {
        partialRefunds: [...existingRefunds, partialRefund],

        totalRefundedAmount: roundMoney(
          previousRefundedAmount + currentAmount
        ),

        "partialRefundOffer.status": "completed",
        "partialRefundOffer.completedAt":
          FieldValue.serverTimestamp(),

        ...(currentPaypalRefund > 0
          ? {
              "partialRefundOffer.paypalRefundTransactionId":
                paypalRefundTransactionId,
              "partialRefundOffer.paypalRefundAmount":
                currentPaypalRefund,
            }
          : {}),

        ...(currentWalletRefund > 0
          ? {
              "partialRefundOffer.walletRefundAmount":
                currentWalletRefund,
              "partialRefundOffer.walletTransactionId":
                walletTransactionId,
            }
          : {}),

        "statusHistory.partial_refund_completed":
          FieldValue.serverTimestamp(),

        updatedAt: FieldValue.serverTimestamp(),
      });
    });

    await recordAdminAudit({
      actorUid: admin.uid,
      actorEmail: admin.email,
      action: "refund.partial_completed",
      targetType: "request",
      targetId: requestId,
      detail: {
        amount,
        walletRefund,
        paypalRefund,
        paypalRefundTransactionId,
      },
    });

    return NextResponse.json({
      success: true,
      requestId,
      refund: {
        amount,
        walletRefund,
        paypalRefund,
        paypalRefundTransactionId:
          paypalRefund > 0 ? paypalRefundTransactionId : null,
      },
    });
  }
);

