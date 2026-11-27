import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";

import { adminDb } from "@/lib/firebaseAdmin";
import { withErrorHandler } from "@/utils/errors";
import { requireAdmin, getAdminAuthError } from "@/lib/adminAuth";
import { recordAdminAudit } from "@/lib/adminAudit";
import { readAndValidateBody, refundOfferBodySchema } from "@/lib/validation";
import { isMinor, storedMinor, toDecimal } from "@/lib/money";
import { remainingRefundable } from "@/features/finance/services/refundMath";

type OfferOutcome =
  | { kind: "created"; amount: number }
  | { kind: "rejected"; status: number; error: string };

export const POST = withErrorHandler(
  async (
    req: NextRequest,
    {
      params,
    }: {
      params: Promise<{ requestId: string }>;
    }
  ) => {
    try {
      const admin = await requireAdmin(req);

      const { requestId } = await params;

      const parsed = await readAndValidateBody(req, refundOfferBodySchema);

      if (!parsed.success) {
        return NextResponse.json(
          {
            success: false,
            error: "A reason is required to offer a refund.",
          },
          { status: 400 }
        );
      }

      const reason = parsed.data.reason;

      const requestRef = adminDb.collection("requests").doc(requestId);

      /*
       * The amount and the offer are read and written in one transaction. A
       * partial refund can complete between an offer created from an
       * out-of-transaction read and the customer accepting it; keeping the
       * read and write together (and comparing at acceptance as well) is what
       * stops the offer promising money that has already been returned.
       */
      const outcome = await adminDb.runTransaction<OfferOutcome>(
        async (transaction) => {
          const snapshot = await transaction.get(requestRef);

          if (!snapshot.exists) {
            return {
              kind: "rejected",
              status: 404,
              error: "Request not found.",
            };
          }

          const request = snapshot.data();

          if (request?.status !== "purchased") {
            return {
              kind: "rejected",
              status: 400,
              error:
                "A refund can only be offered after the order has been purchased.",
            };
          }

          if (request?.refundRequest) {
            return {
              kind: "rejected",
              status: 400,
              error: "A refund request already exists.",
            };
          }

          if (request?.refundOffer?.offered) {
            return {
              kind: "rejected",
              status: 400,
              error: "A refund has already been offered.",
            };
          }

          /*
           * A partial refund awaiting the customer (or awaiting the admin who
           * records it) will change the remaining balance. Offering the full
           * refund now would race that settlement, so wait for it to finish.
           */
          const partialStatus = request?.partialRefundOffer?.status;

          if (partialStatus === "offered" || partialStatus === "accepted") {
            return {
              kind: "rejected",
              status: 400,
              error:
                "A partial refund is still pending for this request. Wait for it to complete before offering a full refund.",
            };
          }

          /*
           * ========================================
           * REFUND AMOUNT
           * ========================================
           *
           * Offer only what is still owed. A partial refund has already
           * returned part of the payment, so offering the full paid amount
           * here would promise the customer more than the remaining
           * refundable balance.
           */

          const payment = request?.payment;

          if (!payment) {
            return {
              kind: "rejected",
              status: 400,
              error: "No payment was found for this request.",
            };
          }

          const amountMinor =
            storedMinor(payment, "amountPaid") ||
            storedMinor(payment, "amount");

          if (!isMinor(amountMinor) || amountMinor <= 0) {
            return {
              kind: "rejected",
              status: 400,
              error: "Invalid payment amount.",
            };
          }

          const totalPaid = toDecimal(amountMinor);
          const alreadyRefunded = Number(request?.totalRefundedAmount ?? 0);

          if (!Number.isFinite(alreadyRefunded) || alreadyRefunded < 0) {
            return {
              kind: "rejected",
              status: 500,
              error: "Invalid existing refund total.",
            };
          }

          const amount = remainingRefundable(totalPaid, alreadyRefunded);

          if (amount <= 0) {
            return {
              kind: "rejected",
              status: 400,
              error: "This request has already been refunded in full.",
            };
          }

          transaction.update(requestRef, {
            status: "refund_offered",

            refundOffer: {
              offered: true,
              reason,
              amount,
              offeredAt: FieldValue.serverTimestamp(),
            },

            "statusHistory.refund_offered": FieldValue.serverTimestamp(),

            updatedAt: FieldValue.serverTimestamp(),
          });

          return { kind: "created", amount };
        }
      );

      if (outcome.kind === "rejected") {
        return NextResponse.json(
          {
            success: false,
            error: outcome.error,
          },
          { status: outcome.status }
        );
      }

      try {
        await recordAdminAudit({
          actorUid: admin.uid,
          actorEmail: admin.email,
          action: "refund.offered",
          targetType: "request",
          targetId: requestId,
          detail: { amount: outcome.amount, reason },
        });
      } catch {
        /* best-effort — the offer was already persisted */
      }

      return NextResponse.json({
        success: true,
        requestId,
        status: "refund_offered",
        refundOffer: {
          amount: outcome.amount,
          reason,
        },
      });
    } catch (error) {
      const authError = getAdminAuthError(error);

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

      console.error("Admin refund offer error:", error);

      return NextResponse.json(
        {
          success: false,
          error: "Unable to offer refund.",
        },
        { status: 500 }
      );
    }
  }
);
