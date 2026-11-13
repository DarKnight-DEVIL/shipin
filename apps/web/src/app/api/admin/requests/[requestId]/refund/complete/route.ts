import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";

import { adminDb } from "@/lib/firebaseAdmin";
import { requireAdmin, getAdminAuthError } from "@/lib/adminAuth";
import { recordAdminAudit } from "@/lib/adminAudit";
import { withErrorHandler, createShipINError } from "@/utils/errors";
import { requestIdSchema } from "@/lib/validation";

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
 * POST /api/admin/requests/[requestId]/refund/complete
 *
 * Finalises an admin-initiated refund once every portion has been handled.
 *
 * No money moves here: the wallet portion is credited by
 * `/api/admin/wallet/credit` (which also sets `walletStatus`) and the PayPal
 * portion is recorded by `/refund/paypal`. This endpoint is the explicit
 * "everything is done" transition, and it refuses to run while a portion is
 * still outstanding so a request can never be marked refunded with money
 * unreturned.
 *
 * Completing an already-completed refund is a no-op that reports
 * `alreadyCompleted: true`, so a double click cannot produce an error.
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

      const walletPortion = roundMoney(Number(refundRequest.walletAmount ?? 0));
      const paypalPortion = roundMoney(Number(refundRequest.paypalAmount ?? 0));
      const amount = roundMoney(
        Number(refundRequest.amount ?? walletPortion + paypalPortion)
      );

      if (refundRequest.status === "completed") {
        return { alreadyCompleted: true, amount };
      }

      const walletDone =
        walletPortion <= 0 || refundRequest.walletStatus === "completed";
      const paypalDone =
        paypalPortion <= 0 || refundRequest.paypalRefundStatus === "completed";

      if (!walletDone) {
        throw createShipINError(
          "Credit the wallet portion of this refund before completing it.",
          "BAD_REQUEST",
          400
        );
      }

      if (!paypalDone) {
        throw createShipINError(
          "Record the PayPal refund before completing it.",
          "BAD_REQUEST",
          400
        );
      }

      transaction.update(requestRef, {
        "refundRequest.status": "completed",
        "refundRequest.processedAt": FieldValue.serverTimestamp(),
        status: "refunded",
        "statusHistory.refunded": FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });

      return { alreadyCompleted: false, amount };
    });

    await recordAdminAudit({
      actorUid: admin.uid,
      actorEmail: admin.email,
      action: "refund.completed",
      targetType: "request",
      targetId: requestId,
      detail: {
        amount: outcome.amount,
        alreadyCompleted: outcome.alreadyCompleted,
      },
    });

    return NextResponse.json({
      success: true,
      requestId,
      status: "refunded",
      alreadyCompleted: outcome.alreadyCompleted,
    });
  }
);
