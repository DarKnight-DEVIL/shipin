import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";

import { adminDb } from "@/lib/firebaseAdmin";
import { requireAdmin, getAdminAuthError } from "@/lib/adminAuth";
import { recordAdminAudit } from "@/lib/adminAudit";
import { withErrorHandler, createShipINError } from "@/utils/errors";
import {
  paypalRefundBodySchema,
  requestIdSchema,
  validateBody,
} from "@/lib/validation";

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
 * POST /api/admin/requests/[requestId]/refund/paypal
 *
 * Records the PayPal portion of an admin-initiated refund.
 *
 * The money itself was already returned through the PayPal dashboard, so this
 * endpoint never talks to PayPal: it stores the transaction id against the
 * request. Once both portions are recorded the request is marked refunded, which
 * mirrors what `adminCreditWallet` does when it completes the wallet portion.
 */
export const POST = withErrorHandler(
  async (
    request: NextRequest,
    context: { params: Promise<{ requestId: string }> }
  ) => {
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

    const parsedBody = validateBody(body, paypalRefundBodySchema);
    if (!parsedBody.success) {
      throw createShipINError("Invalid request body.", "VALIDATION_ERROR", 400);
    }

    const { amount, transactionId } = parsedBody.data;
    const requestRef = adminDb.collection("requests").doc(requestId);

    const outcome = await adminDb.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(requestRef);

      if (!snapshot.exists) {
        throw createShipINError("Request not found.", "NOT_FOUND", 404);
      }

      const data = snapshot.data() || {};
      const refundRequest = data.refundRequest;

      if (!refundRequest) {
        throw createShipINError(
          "No refund workflow exists for this request.",
          "BAD_REQUEST",
          400
        );
      }

      if (refundRequest.status === "completed") {
        throw createShipINError(
          "This refund is already completed.",
          "BAD_REQUEST",
          400
        );
      }

      if (refundRequest.paypalRefundStatus === "completed") {
        throw createShipINError(
          "The PayPal portion of this refund has already been recorded.",
          "BAD_REQUEST",
          400
        );
      }

      const paypalPortion = roundMoney(Number(refundRequest.paypalAmount ?? 0));

      if (paypalPortion <= 0) {
        throw createShipINError(
          "This refund has no PayPal portion to record.",
          "BAD_REQUEST",
          400
        );
      }

      const refundAmount = roundMoney(Number(amount));

      if (refundAmount > paypalPortion + 0.01) {
        throw createShipINError(
          "The PayPal refund cannot exceed the PayPal portion of this refund.",
          "BAD_REQUEST",
          400
        );
      }

      const walletPortion = roundMoney(Number(refundRequest.walletAmount ?? 0));
      const walletDone =
        walletPortion <= 0 || refundRequest.walletStatus === "completed";

      transaction.update(requestRef, {
        "refundRequest.paypalRefundStatus": "completed",
        "refundRequest.paypalRefundAmount": refundAmount,
        "refundRequest.paypalRefundTransactionId": transactionId,
        "refundRequest.paypalRefundedAt": FieldValue.serverTimestamp(),

        ...(walletDone
          ? {
              "refundRequest.status": "completed",
              "refundRequest.processedAt": FieldValue.serverTimestamp(),
              status: "refunded",
              "statusHistory.refunded": FieldValue.serverTimestamp(),
            }
          : {}),

        updatedAt: FieldValue.serverTimestamp(),
      });

      return { refundAmount, walletDone };
    });

    await recordAdminAudit({
      actorUid: admin.uid,
      actorEmail: admin.email,
      action: "refund.paypal_recorded",
      targetType: "request",
      targetId: requestId,
      detail: {
        amount: outcome.refundAmount,
        transactionId,
        fullyRefunded: outcome.walletDone,
      },
    });

    return NextResponse.json({
      success: true,
      requestId,
      refund: {
        amount: outcome.refundAmount,
        transactionId,
        status: outcome.walletDone ? "completed" : "requested",
      },
    });
  }
);
