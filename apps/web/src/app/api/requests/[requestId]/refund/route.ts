import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";

import { adminDb } from "@/lib/firebaseAdmin";
import { requireAuthWithProfile } from "@/lib/auth";
import { sameCents } from "@/lib/paypal/amounts";
import {
  customerRefundRequestBodySchema,
  requestIdSchema,
  validateBody,
} from "@/lib/validation";
import { createShipINError, withErrorHandler } from "@/utils/errors";

type RefundOutcome =
  | {
      kind: "stale";
      amount: number;
    }
  | {
      kind: "recorded";
      preference: string;
      amount: number;
      walletAmount: number;
      paypalAmount: number;
    };

/**
 * POST /api/requests/[requestId]/refund
 *
 * The customer asks for their money back. The route records the destination
 * they chose; it deliberately does not move money. An admin still reviews and
 * completes the refund, exactly as they do for a refund they initiate.
 *
 * Ownership comes from the request document's `userId` compared with the
 * verified token — never from the path alone. A missing request and somebody
 * else's request both answer 404 so an id cannot be used to confirm existence.
 *
 * Accepting a full-refund offer re-checks the balance inside the transaction.
 * A partial refund can settle between the offer being created and this tap, so
 * the stored offer amount is compared with what is actually left; a mismatch
 * refreshes the offer and refuses this acceptance rather than recording more
 * than remains refundable.
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

    const parsedBody = validateBody(body, customerRefundRequestBodySchema);
    if (!parsedBody.success) {
      throw createShipINError("Invalid request body.", "VALIDATION_ERROR", 400);
    }

    const { preference } = parsedBody.data;

    const requestRef = adminDb.collection("requests").doc(requestId);

    const outcome = await adminDb.runTransaction<RefundOutcome>(
      async (transaction) => {
        const snapshot = await transaction.get(requestRef);

        if (!snapshot.exists) {
          throw createShipINError("Request not found.", "NOT_FOUND", 404);
        }

        const data = snapshot.data() || {};

        if (data.userId !== auth.profile.uid) {
          throw createShipINError("Request not found.", "NOT_FOUND", 404);
        }

        /*
         * Two ways in: the customer starts a refund on a purchased order, or
         * they accept an admin's full-refund offer. The offer moves the request
         * to `refund_offered`, so accepting it is the only reason that status
         * is accepted here — and only while the offer is still active.
         */
        const refundOfferActive =
          data.status === "refund_offered" &&
          data.refundOffer?.offered === true;

        if (data.status !== "purchased" && !refundOfferActive) {
          throw createShipINError(
            "A refund can only be requested for a purchased order or an active refund offer.",
            "BAD_REQUEST",
            400
          );
        }

        if (data.refundRequest) {
          throw createShipINError(
            "A refund request already exists for this request.",
            "BAD_REQUEST",
            400
          );
        }

        /*
         * A partial refund that is still awaiting the customer or the admin
         * will change the balance; letting a full refund run now would return
         * the same money twice.
         */
        if (
          data.partialRefundOffer?.status === "offered" ||
          data.partialRefundOffer?.status === "accepted"
        ) {
          throw createShipINError(
            "Respond to the partial refund offer before requesting a full refund.",
            "BAD_REQUEST",
            400
          );
        }

        const payment = data.payment;
        if (!payment) {
          throw createShipINError(
            "No payment was found for this request.",
            "BAD_REQUEST",
            400
          );
        }

        const totalPaid = Number(payment.amountPaid ?? payment.amount ?? 0);
        if (!Number.isFinite(totalPaid) || totalPaid <= 0) {
          throw createShipINError(
            "Invalid payment amount.",
            "BAD_REQUEST",
            400
          );
        }

        // Only completed refunds count against the balance, including one that
        // completed after the offer was created — this read is in-transaction.
        const previousRefunded = Number(data.totalRefundedAmount ?? 0);
        if (!Number.isFinite(previousRefunded) || previousRefunded < 0) {
          throw createShipINError(
            "Invalid existing refund total.",
            "INTERNAL_ERROR",
            500
          );
        }

        const amount = Number((totalPaid - previousRefunded).toFixed(2));

        if (amount <= 0) {
          if (refundOfferActive) {
            /*
             * The offer can no longer be honoured. Void it so the customer is
             * not offered a refund that has already been paid out, and commit
             * that invalidation rather than throwing it away with the
             * transaction.
             */
            transaction.update(requestRef, {
              "refundOffer.offered": false,
              "refundOffer.staleAt": FieldValue.serverTimestamp(),
              "refundOffer.staleReason": "fully_refunded",
              updatedAt: FieldValue.serverTimestamp(),
            });

            return { kind: "stale", amount: 0 };
          }

          throw createShipINError(
            "This request has already been refunded in full.",
            "BAD_REQUEST",
            400
          );
        }

        if (refundOfferActive) {
          const offeredAmount = Number(data.refundOffer?.amount ?? NaN);

          /*
           * Compare the amount the customer was shown with the balance at the
           * moment of acceptance. Firestore retries this callback if the
           * request document changed underneath it, so a partial refund that
           * lands concurrently is seen here rather than lost in a stale read.
           */
          if (!Number.isFinite(offeredAmount) || !sameCents(offeredAmount, amount)) {
            transaction.update(requestRef, {
              "refundOffer.amount": amount,
              "refundOffer.refreshedAt": FieldValue.serverTimestamp(),
              updatedAt: FieldValue.serverTimestamp(),
            });

            return { kind: "stale", amount };
          }
        }

        /*
         * Split the remainder over what each source still has left. A partial
         * refund has already consumed part of the wallet or PayPal share, so
         * storing the full payment breakdown here would refund those portions
         * a second time when the admin card renders them.
         */
        const partialRefunds = Array.isArray(data.partialRefunds)
          ? (data.partialRefunds as Array<Record<string, unknown>>)
          : [];

        const paidWallet = Math.max(0, Number(payment.walletAmount ?? 0));
        const paidPaypal = Math.max(0, Number(payment.paypalAmount ?? 0));

        // A malformed breakdown must not reach the arithmetic below: `NaN`
        // would poison both portions and be written to Firestore as the refund
        // split.
        if (!Number.isFinite(paidWallet) || !Number.isFinite(paidPaypal)) {
          throw createShipINError(
            "Invalid payment breakdown.",
            "BAD_REQUEST",
            400
          );
        }

        let remainingWallet = Number(paidWallet.toFixed(2));
        let remainingPaypal = Number(paidPaypal.toFixed(2));

        for (const refund of partialRefunds) {
          const refunded = Number(Number(refund?.amount ?? 0).toFixed(2));

          if (!Number.isFinite(refunded) || refunded <= 0) continue;

          const walletField = Number(refund?.walletRefundAmount);
          const paypalField = Number(refund?.paypalRefundAmount);
          const hasRecordedSplit =
            Number.isFinite(walletField) || Number.isFinite(paypalField);

          let walletShare: number;
          let paypalShare: number;

          if (hasRecordedSplit) {
            walletShare = Number.isFinite(walletField)
              ? Math.max(0, walletField)
              : 0;

            paypalShare = Number.isFinite(paypalField)
              ? Math.max(0, paypalField)
              : Math.max(0, refunded - walletShare);
          } else if (refund?.method === "wallet") {
            walletShare = refunded;
            paypalShare = 0;
          } else {
            /*
             * Older entries recorded only an amount. Consume the wallet share
             * first, exactly how a refund is split, so the remaining wallet
             * balance is not overstated and refunded twice.
             */
            walletShare = Math.min(refunded, remainingWallet);
            paypalShare = Number((refunded - walletShare).toFixed(2));
          }

          remainingWallet = Number(
            Math.max(0, remainingWallet - walletShare).toFixed(2)
          );
          remainingPaypal = Number(
            Math.max(0, remainingPaypal - paypalShare).toFixed(2)
          );
        }

        /*
         * Wallet means the whole remainder goes to the wallet. Every other
         * preference returns money to where it came from, so the remaining
         * wallet share is used first and the rest is owed through PayPal.
         */
        const walletAmount =
          preference === "wallet" ? amount : Math.min(amount, remainingWallet);

        const paypalAmount =
          preference === "wallet"
            ? 0
            : Number((amount - walletAmount).toFixed(2));

        if (paypalAmount > remainingPaypal + 0.01) {
          throw createShipINError(
            "This refund cannot be covered by the remaining original payment sources.",
            "BAD_REQUEST",
            400
          );
        }

        transaction.update(requestRef, {
          status: "refund_requested",

          refundRequest: {
            status: "requested",
            preference,
            amount,
            walletAmount,
            paypalAmount,
            requestedAt: FieldValue.serverTimestamp(),
            initiatedBy: "customer",
          },

          "statusHistory.refund_requested": FieldValue.serverTimestamp(),

          updatedAt: FieldValue.serverTimestamp(),
        });

        return {
          kind: "recorded",
          preference,
          amount,
          walletAmount,
          paypalAmount,
        };
      }
    );

    if (outcome.kind === "stale") {
      return NextResponse.json(
        {
          success: false,
          code: "REFUND_OFFER_STALE",
          error:
            outcome.amount > 0
              ? `The refund amount is now $${outcome.amount.toFixed(
                  2
                )}. Review the updated offer and accept it again.`
              : "This request has already been refunded in full.",
          refundOffer: {
            amount: outcome.amount,
            offered: outcome.amount > 0,
          },
        },
        { status: 409, headers: { "Cache-Control": "no-store" } }
      );
    }

    return NextResponse.json({
      success: true,
      requestId,
      status: "refund_requested",
      refundRequest: {
        status: "requested",
        preference: outcome.preference,
        amount: outcome.amount,
        walletAmount: outcome.walletAmount,
        paypalAmount: outcome.paypalAmount,
      },
    });
  }
);
