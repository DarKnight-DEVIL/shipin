import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";

import { adminDb } from "@/lib/firebaseAdmin";
import { requireAuthWithProfile } from "@/lib/auth";
import {
  customerPartialRefundBodySchema,
  requestIdSchema,
  validateBody,
} from "@/lib/validation";
import { createShipINError, withErrorHandler } from "@/utils/errors";
import { minorFromStored, storedMinor } from "@/lib/money";
import { balanceFields, ledgerFields } from "@/lib/moneyMode";

function roundMoney(value: number) {
  return Number(value.toFixed(2));
}

/**
 * POST /api/requests/[requestId]/partial-refund
 *
 * The customer answers an admin's partial-refund offer.
 *
 * Wallet is the instant path, exactly as the UI promises: the amount is
 * credited to their ShipIN wallet in the same transaction that closes the
 * offer, with a matching ledger entry and `totalRefundedAmount` increment.
 * Choosing the original payment method marks the offer accepted; an admin then
 * records the PayPal transaction through the existing completion route, so no
 * customer request can claim money left the business before it did.
 *
 * Every check runs inside the transaction that writes, so two taps or a retry
 * cannot credit the wallet twice.
 */
export const POST = withErrorHandler(
  async (
    request: NextRequest,
    context: { params: Promise<{ requestId: string }> }
  ) => {
    const auth = await requireAuthWithProfile(request);
    if (auth instanceof NextResponse) return auth;

    const parsedParams = requestIdSchema.safeParse(await context.params);
    if (!parsedParams.success) {
      throw createShipINError("Invalid request ID.", "VALIDATION_ERROR", 400);
    }

    const { requestId } = parsedParams.data;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw createShipINError("Invalid request body.", "VALIDATION_ERROR", 400);
    }

    const parsedBody = validateBody(body, customerPartialRefundBodySchema);
    if (!parsedBody.success) {
      throw createShipINError("Invalid request body.", "VALIDATION_ERROR", 400);
    }

    const { preference } = parsedBody.data;
    const uid = auth.profile.uid;

    const requestRef = adminDb.collection("requests").doc(requestId);
    const walletTransactionRef = adminDb.collection("walletTransactions").doc();

    // Minted once, outside the transaction: a Firestore retry must not create a
    // second refund id for the same acceptance.
    const partialRefundId = `partial_${requestId}_${Date.now()}`;

    const outcome = await adminDb.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(requestRef);

      if (!snapshot.exists) {
        throw createShipINError("Request not found.", "NOT_FOUND", 404);
      }

      const data = snapshot.data() || {};

      if (data.userId !== uid) {
        throw createShipINError("Request not found.", "NOT_FOUND", 404);
      }

      const offer = data.partialRefundOffer;

      if (!offer) {
        throw createShipINError(
          "No partial refund offer exists.",
          "BAD_REQUEST",
          400
        );
      }

      if (offer.status !== "offered") {
        throw createShipINError(
          "This partial refund offer is no longer available.",
          "BAD_REQUEST",
          400
        );
      }

      const amount = roundMoney(Number(offer.amount));

      if (!Number.isFinite(amount) || amount <= 0) {
        throw createShipINError("Invalid refund amount.", "BAD_REQUEST", 400);
      }

      if (preference === "original_payment") {
        transaction.update(requestRef, {
          "partialRefundOffer.status": "accepted",
          "partialRefundOffer.selectedMethod": "original_payment",
          "partialRefundOffer.selectedAt": FieldValue.serverTimestamp(),

          "statusHistory.partial_refund_accepted": FieldValue.serverTimestamp(),

          updatedAt: FieldValue.serverTimestamp(),
        });

        return { status: "accepted" as const, amount };
      }

      /* Wallet credit. Read the wallet before the first write. */
      const walletRef = adminDb.collection("wallets").doc(uid);
      const walletSnapshot = await transaction.get(walletRef);

      const currentBalanceMinor = walletSnapshot.exists
        ? storedMinor(walletSnapshot.data(), "balance")
        : 0;

      const newBalanceMinor =
        currentBalanceMinor + minorFromStored(amount);

      transaction.set(
        walletRef,
        {
          ...balanceFields(newBalanceMinor),
          currency: walletSnapshot.exists
            ? walletSnapshot.data()?.currency || "USD"
            : "USD",
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      transaction.set(walletTransactionRef, {
        userId: uid,
        type: "refund",
        ...ledgerFields(minorFromStored(amount), newBalanceMinor),
        description: offer.reason || "Partial refund",
        requestId,
        createdAt: FieldValue.serverTimestamp(),
        createdBy: uid,
      });

      const existingRefunds = Array.isArray(data.partialRefunds)
        ? data.partialRefunds
        : [];

      const previousRefundedAmount = roundMoney(
        Number(data.totalRefundedAmount ?? 0)
      );

      transaction.update(requestRef, {
        partialRefunds: [
          ...existingRefunds,
          {
            id: partialRefundId,
            amount,
            reason: offer.reason || "",
            method: "wallet",
            walletRefundAmount: amount,
            paypalRefundAmount: 0,
            walletTransactionId: walletTransactionRef.id,
            createdAt: new Date(),
            createdBy: uid,
          },
        ],

        totalRefundedAmount: roundMoney(previousRefundedAmount + amount),

        "partialRefundOffer.status": "completed",
        "partialRefundOffer.completedAt": FieldValue.serverTimestamp(),
        "partialRefundOffer.selectedMethod": "wallet",
        "partialRefundOffer.walletRefundAmount": amount,
        "partialRefundOffer.walletTransactionId": walletTransactionRef.id,

        "statusHistory.partial_refund_completed": FieldValue.serverTimestamp(),

        updatedAt: FieldValue.serverTimestamp(),
      });

      return {
        status: "completed" as const,
        amount,
        walletTransactionId: walletTransactionRef.id,
      };
    });

    return NextResponse.json({
      success: true,
      requestId,
      offer: {
        id: partialRefundId,
        amount: outcome.amount,
        status: outcome.status,
        selectedMethod: preference,
      },
    });
  }
);
