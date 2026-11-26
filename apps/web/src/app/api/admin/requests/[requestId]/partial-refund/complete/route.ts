import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";

import { adminDb } from "@/lib/firebaseAdmin";
import { requireAdmin, getAdminAuthError } from "@/lib/adminAuth";
import { recordAdminAudit } from "@/lib/adminAudit";

import {
  completePartialRefundBodySchema,
  requestIdSchema,
  validateBody,
} from "@/lib/validation";

import { withErrorHandler, createShipINError } from "@/utils/errors";
import { minorFromStored, storedMinor } from "@/lib/money";
import { balanceFields, ledgerFields } from "@/lib/moneyMode";
import { paypalRefundTransactionRef } from "@/lib/paypal/refundTransactions";

function roundMoney(value: number) {
  return Number(value.toFixed(2));
}

/** Turn a requireAdmin rejection into the 401/403 the admin client expects. */
async function requireAdminOrThrow(request: NextRequest) {
  try {
    return await requireAdmin(request);
  } catch (error) {
    const authError = getAdminAuthError(error);
    throw createShipINError(
      authError.error,
      "AUTHORIZATION_ERROR",
      authError.status
    );
  }
}

/**
 * POST /api/admin/requests/[requestId]/partial-refund/complete
 *
 * Completes an accepted partial-refund offer: credits the wallet share, records
 * the PayPal share against its transaction id, and marks the offer completed.
 *
 * Every check runs inside the Firestore transaction that performs the writes.
 * A pre-transaction read used to duplicate the same validation and throw plain
 * errors on the second pass, so a refresh that changed the offer between the
 * two reads answered 500. There is now one validation path, and each failure is
 * a typed ShipINError with the status the admin client expects (404 for a
 * missing request, 409 for a PayPal transaction already recorded, 400 for
 * everything the admin can fix by retrying with correct input).
 */
export const POST = withErrorHandler(
  async (
    request: NextRequest,
    context: { params: Promise<{ requestId: string }> }
  ) => {
    // Admin-only: this route writes a refund completion plus its audit trail.
    // `requireAdmin` also enforces MFA elevation, so a customer or a
    // half-authenticated admin session cannot reach the transaction below.
    const admin = await requireAdminOrThrow(request);

    const validatedParams = requestIdSchema.safeParse(await context.params);
    if (!validatedParams.success) {
      throw createShipINError("Invalid request ID.", "VALIDATION_ERROR", 400);
    }

    const { requestId } = validatedParams.data;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw createShipINError("Invalid request body.", "VALIDATION_ERROR", 400);
    }

    const parseResult = validateBody(body, completePartialRefundBodySchema);
    if (!parseResult.success) {
      throw createShipINError("Invalid request body.", "VALIDATION_ERROR", 400);
    }

    const { paypalRefundTransactionId } = parseResult.data;

    const requestRef = adminDb.collection("requests").doc(requestId);
    const walletTransactionRef = adminDb.collection("walletTransactions").doc();

    // Minted once, outside the transaction: Firestore retries the callback on
    // contention and a retry must not produce a second wallet-ledger id.
    const partialRefundId = `partial_${requestId}_${Date.now()}`;

    const outcome = await adminDb.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(requestRef);

      if (!snapshot.exists) {
        throw createShipINError("Request not found.", "NOT_FOUND", 404);
      }

      const data = snapshot.data() || {};
      const offer = data.partialRefundOffer;

      if (!offer) {
        throw createShipINError(
          "No partial refund offer exists.",
          "BAD_REQUEST",
          400
        );
      }

      if (offer.status !== "accepted") {
        throw createShipINError(
          "This partial refund is not awaiting admin processing.",
          "BAD_REQUEST",
          400
        );
      }

      if (offer.selectedMethod !== "original_payment") {
        throw createShipINError(
          "This offer was not accepted using the original payment method.",
          "BAD_REQUEST",
          400
        );
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

      const walletRefund = Math.min(amount, Math.max(0, originalWalletAmount));

      const paypalRefund = roundMoney(amount - walletRefund);

      if (paypalRefund > originalPaypalAmount + 0.01) {
        throw createShipINError(
          "The partial refund amount cannot be covered by the original payment sources.",
          "BAD_REQUEST",
          400
        );
      }

      if (paypalRefund > 0 && !paypalRefundTransactionId) {
        throw createShipINError(
          "PayPal refund transaction ID is required before completing this refund.",
          "VALIDATION_ERROR",
          400
        );
      }

      /*
       * Every read below stays above the first write: Firestore rejects a
       * transaction that reads after it has written.
       */
      const refundTransactionRef =
        paypalRefund > 0 && paypalRefundTransactionId
          ? paypalRefundTransactionRef(paypalRefundTransactionId)
          : null;

      if (refundTransactionRef) {
        const existingTransaction = await transaction.get(refundTransactionRef);

        if (existingTransaction.exists) {
          throw createShipINError(
            "That PayPal refund transaction has already been recorded.",
            "DUPLICATE_TRANSACTION",
            409
          );
        }
      }

      let walletTransactionId: string | null = null;

      if (walletRefund > 0) {
        const walletRef = adminDb.collection("wallets").doc(data.userId);

        const walletSnapshot = await transaction.get(walletRef);

        /*
         * Minor units (ADR-0008, phase 2): read whichever representation the
         * wallet holds and add in cents, so a refund cannot land a float tail in
         * a balance that later arithmetic reads back.
         */
        const currentBalanceMinor = walletSnapshot.exists
          ? storedMinor(walletSnapshot.data(), "balance")
          : 0;

        const newWalletBalanceMinor =
          currentBalanceMinor + minorFromStored(walletRefund);

        transaction.set(
          walletRef,
          {
            ...balanceFields(newWalletBalanceMinor),
            currency: walletSnapshot.exists
              ? walletSnapshot.data()?.currency || "USD"
              : "USD",
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );

        transaction.set(walletTransactionRef, {
          userId: data.userId,
          type: "refund",
          ...ledgerFields(
            minorFromStored(walletRefund),
            newWalletBalanceMinor
          ),
          description: offer.reason || "Partial refund",
          requestId,
          createdAt: FieldValue.serverTimestamp(),
          createdBy: admin.uid,
          createdByEmail: admin.email || null,
        });

        walletTransactionId = walletTransactionRef.id;
      }

      const existingRefunds = Array.isArray(data.partialRefunds)
        ? data.partialRefunds
        : [];

      const previousRefundedAmount = roundMoney(
        Number(data.totalRefundedAmount ?? 0)
      );

      const partialRefund = {
        id: partialRefundId,
        amount,
        reason: offer.reason || "",
        method: "original_payment",
        walletRefundAmount: walletRefund,
        paypalRefundAmount: paypalRefund,
        ...(paypalRefund > 0 ? { paypalRefundTransactionId } : {}),
        createdAt: new Date(),
        createdBy: admin.uid,
        createdByEmail: admin.email || null,
      };

      transaction.update(requestRef, {
        partialRefunds: [...existingRefunds, partialRefund],

        totalRefundedAmount: roundMoney(previousRefundedAmount + amount),

        "partialRefundOffer.status": "completed",
        "partialRefundOffer.completedAt": FieldValue.serverTimestamp(),

        ...(paypalRefund > 0
          ? {
              "partialRefundOffer.paypalRefundTransactionId":
                paypalRefundTransactionId,
              "partialRefundOffer.paypalRefundAmount": paypalRefund,
            }
          : {}),

        ...(walletRefund > 0
          ? {
              "partialRefundOffer.walletRefundAmount": walletRefund,
              "partialRefundOffer.walletTransactionId": walletTransactionId,
            }
          : {}),

        "statusHistory.partial_refund_completed": FieldValue.serverTimestamp(),

        updatedAt: FieldValue.serverTimestamp(),
      });

      if (refundTransactionRef) {
        transaction.set(refundTransactionRef, {
          transactionId: paypalRefundTransactionId,
          requestId,
          kind: "partial",
          amount: paypalRefund,
          createdAt: FieldValue.serverTimestamp(),
        });
      }

      return { amount, walletRefund, paypalRefund };
    });

    await recordAdminAudit({
      actorUid: admin.uid,
      actorEmail: admin.email,
      action: "refund.partial_completed",
      targetType: "request",
      targetId: requestId,
      detail: {
        amount: outcome.amount,
        walletRefund: outcome.walletRefund,
        paypalRefund: outcome.paypalRefund,
        paypalRefundTransactionId,
      },
    });

    return NextResponse.json({
      success: true,
      requestId,
      refund: {
        amount: outcome.amount,
        walletRefund: outcome.walletRefund,
        paypalRefund: outcome.paypalRefund,
        paypalRefundTransactionId:
          outcome.paypalRefund > 0 ? paypalRefundTransactionId : null,
      },
    });
  }
);
