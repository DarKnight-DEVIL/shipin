import { NextRequest, NextResponse } from "next/server";

import { FieldValue } from "firebase-admin/firestore";

import { adminDb } from "@/lib/firebaseAdmin";

import { requireAdmin, getAdminAuthError } from "@/lib/adminAuth";
import { withErrorHandler } from "@/utils/errors";
import { recordAdminAudit } from "@/lib/adminAudit";
import { adminCreditBodySchema, readAndValidateBody } from "@/lib/validation";
import {
  readIdempotencyKey,
  readIdempotentResponse,
  rememberIdempotentResponse,
} from "@/lib/idempotency";
import { isMinor, minorFromStored, storedMinor, toDecimal } from "@/lib/money";
import { balanceFields, ledgerFields } from "@/lib/moneyMode";
import { walletCreditMax } from "@/config/walletCreditLimit";

export const POST = withErrorHandler(async (request: NextRequest) => {
  try {
    /*
     * ========================================
     * ADMIN AUTHORIZATION
     * ========================================
     */

    const admin = await requireAdmin(request);

    /*
     * ========================================
     * READ REQUEST
     * ========================================
     */

    const parsed = await readAndValidateBody(request, adminCreditBodySchema);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error },
        { status: 400 }
      );
    }

    const { customerId, amount, description, type } = parsed.data;
    const requestId = parsed.data.requestId ?? null;

    const isRefund = type === "refund";

    const idempotencyKey = readIdempotencyKey(request);
    const replayScope = {
      uid: admin.uid,
      scope: "admin.wallet.credit",
      key: idempotencyKey ?? "",
    };

    if (idempotencyKey) {
      const prior = await readIdempotentResponse(replayScope);
      if (prior) return NextResponse.json(prior.body, { status: prior.status });
    }

    /*
     * ========================================
     * VALIDATE CUSTOMER
     * ========================================
     *
     * `adminCreditBodySchema` already rejects an empty or whitespace id and a
     * non-positive or over-precise amount, so there is no second check here:
     * it would be unreachable, and unreachable money handling reads as
     * protection that does not exist.
     */

    const creditAmount = Number(amount.toFixed(2));

    /*
     * The rail is configurable (`WALLET_CREDIT_MAX`) but never absent: see
     * `src/config/walletCreditLimit.ts`. The message names the limit that actually
     * applied, so an operator who raised it does not read a stale 10,000.
     */
    const creditMax = walletCreditMax();

    if (creditAmount > creditMax) {
      return NextResponse.json(
        {
          success: false,
          error: `A maximum of ${creditMax.toLocaleString("en-US")} credits can be added at once.`,
          code: "CREDIT_LIMIT_EXCEEDED",
          limit: creditMax,
        },
        {
          status: 400,
        }
      );
    }

    /*
     * ========================================
     * REFUND VALIDATION
     * ========================================
     */

    if (isRefund && !requestId) {
      return NextResponse.json(
        {
          success: false,
          error: "Request ID is required for a refund.",
        },
        {
          status: 400,
        }
      );
    }

    /*
     * ========================================
     * REFERENCES
     * ========================================
     */

    const customerRef = adminDb.collection("users").doc(customerId);

    const walletRef = adminDb.collection("wallets").doc(customerId);

    const transactionRef = adminDb.collection("walletTransactions").doc();

    /*
     * ========================================
     * REQUEST REFERENCE
     * ========================================
     */

    const requestRef = requestId
      ? adminDb.collection("requests").doc(requestId)
      : null;

    /*
     * ========================================
     * ATOMIC WALLET CREDIT
     * ========================================
     */

    const result = await adminDb.runTransaction(async (transaction) => {
      /*
       * Firestore transactions require
       * all reads before writes.
       */

      const customerSnapshot = await transaction.get(customerRef);

      const walletSnapshot = await transaction.get(walletRef);

      /*
       * If this is a refund, read the
       * request inside the same transaction.
       */

      const requestSnapshot = requestRef
        ? await transaction.get(requestRef)
        : null;

      /*
       * CUSTOMER
       */

      if (!customerSnapshot.exists) {
        throw new Error("CUSTOMER_NOT_FOUND");
      }

      const customerData = customerSnapshot.data();

      /*
       * Never credit admin accounts.
       */

      if (customerData?.role === "admin") {
        throw new Error("CANNOT_CREDIT_ADMIN");
      }

      /*
       * ====================================
       * REFUND REQUEST VALIDATION
       * ====================================
       */

      if (isRefund) {
        if (!requestSnapshot || !requestSnapshot.exists) {
          throw new Error("REQUEST_NOT_FOUND");
        }

        const requestData = requestSnapshot.data();

        /*
         * Make absolutely sure the
         * request belongs to this user.
         */

        if (requestData?.userId !== customerId) {
          throw new Error("REQUEST_CUSTOMER_MISMATCH");
        }

        /*
         * Only an active refund request
         * can be processed.
         */

        if (requestData?.refundRequest?.status !== "requested") {
          throw new Error("REFUND_NOT_REQUESTED");
        }

        /*
         * Prevent accidental double
         * wallet refunds.
         */

        if (requestData?.refundRequest?.walletStatus === "completed") {
          throw new Error("WALLET_REFUND_ALREADY_COMPLETED");
        }

        const recordedWalletMinor = minorFromStored(
          requestData?.refundRequest?.walletAmount ?? 0
        );
        const requestedCreditMinor = minorFromStored(creditAmount);

        if (recordedWalletMinor <= 0) {
          throw new Error("REFUND_HAS_NO_WALLET_PORTION");
        }

        if (recordedWalletMinor !== requestedCreditMinor) {
          throw new Error("REFUND_AMOUNT_MISMATCH");
        }
      }

      /*
       * ====================================
       * CURRENT BALANCE
       * ====================================
       */

      /*
       * Read through the compat helper (ADR-0008, phase 2) so a wallet holding
       * either the decimal field or the integer one credits correctly.
       */
      const currentBalanceMinor = walletSnapshot.exists
        ? storedMinor(walletSnapshot.data(), "balance")
        : 0;

      if (!isMinor(currentBalanceMinor) || currentBalanceMinor < 0) {
        throw new Error("INVALID_WALLET_BALANCE");
      }

      /*
       * ====================================
       * NEW BALANCE
       * ====================================
       */

      const newBalanceMinor =
        currentBalanceMinor + minorFromStored(creditAmount);
      const newBalance = toDecimal(newBalanceMinor);

      /*
       * ====================================
       * UPDATE WALLET
       * ====================================
       */

      transaction.set(
        walletRef,
        {
          ...balanceFields(newBalanceMinor),

          currency: walletSnapshot.exists
            ? walletSnapshot.data()?.currency || "USD"
            : "USD",

          updatedAt: FieldValue.serverTimestamp(),
        },
        {
          merge: true,
        }
      );

      /*
       * ====================================
       * AUDIT TRANSACTION
       * ====================================
       */

      transaction.set(transactionRef, {
        userId: customerId,

        type: isRefund ? "refund" : "admin_credit",

        ...ledgerFields(minorFromStored(creditAmount), newBalanceMinor),

        description,

        requestId: requestId,

        createdAt: FieldValue.serverTimestamp(),

        createdBy: admin.uid,

        createdByEmail: admin.email || null,
      });

      /*
       * ====================================
       * MARK REFUND PORTION COMPLETE
       * ====================================
       */

      if (isRefund && requestRef) {
        const requestData = requestSnapshot?.data();

        const refundRequest = requestData?.refundRequest;

        const walletAmount = Number(
          refundRequest?.walletAmount ?? refundRequest?.amount ?? 0
        );

        const paypalAmount = Number(refundRequest?.paypalAmount ?? 0);

        const paypalCompleted =
          refundRequest?.paypalRefundStatus === "completed";

        /*
         * The wallet portion is being completed
         * by this transaction.
         */
        const walletCompleted = true;

        /*
         * Check whether every required refund
         * portion is now complete.
         */
        const walletDone = walletAmount <= 0 || walletCompleted;

        const paypalDone = paypalAmount <= 0 || paypalCompleted;

        const fullyRefunded = walletDone && paypalDone;

        transaction.update(requestRef, {
          "refundRequest.walletStatus": "completed",

          "refundRequest.walletCompletedAt": FieldValue.serverTimestamp(),

          ...(fullyRefunded
            ? {
                "refundRequest.status": "completed",

                "refundRequest.processedAt": FieldValue.serverTimestamp(),

                status: "refunded",

                "statusHistory.refunded": FieldValue.serverTimestamp(),
              }
            : {}),

          updatedAt: FieldValue.serverTimestamp(),
        });
      }

      return {
        previousBalance: toDecimal(currentBalanceMinor),

        creditAdded: creditAmount,

        newBalance,
      };
    });

    /*
     * ========================================
     * SUCCESS
     * ========================================
     */

    await recordAdminAudit({
      actorUid: admin.uid,
      actorEmail: admin.email,
      action: isRefund ? "wallet.refund" : "wallet.credit",
      targetType: "user",
      targetId: customerId,
      detail: {
        type: isRefund ? "refund" : "admin_credit",
        amount: creditAmount,
        requestId,
      },
    });

    const responseBody = {
      success: true,

      customerId,

      previousBalance: result.previousBalance,

      creditAdded: result.creditAdded,

      newBalance: result.newBalance,

      transactionId: transactionRef.id,

      type: isRefund ? "refund" : "admin_credit",
    };

    if (idempotencyKey) {
      await rememberIdempotentResponse(replayScope, {
        status: 200,
        body: responseBody,
      });
    }

    return NextResponse.json(responseBody);
  } catch (error) {
    /*
     * ========================================
     * AUTH ERRORS
     * ========================================
     */

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

    /*
     * ========================================
     * CUSTOM ERRORS
     * ========================================
     */

    if (error instanceof Error) {
      if (error.message === "CUSTOMER_NOT_FOUND") {
        return NextResponse.json(
          {
            success: false,
            error: "Customer could not be found.",
          },
          {
            status: 404,
          }
        );
      }

      if (error.message === "REQUEST_NOT_FOUND") {
        return NextResponse.json(
          {
            success: false,
            error: "Refund request could not be found.",
          },
          {
            status: 404,
          }
        );
      }

      if (error.message === "REQUEST_CUSTOMER_MISMATCH") {
        return NextResponse.json(
          {
            success: false,
            error:
              "This refund request does not belong to the selected customer.",
          },
          {
            status: 400,
          }
        );
      }

      if (error.message === "REFUND_NOT_REQUESTED") {
        return NextResponse.json(
          {
            success: false,
            error: "This request does not have an active refund request.",
          },
          {
            status: 400,
          }
        );
      }

      if (error.message === "WALLET_REFUND_ALREADY_COMPLETED") {
        return NextResponse.json(
          {
            success: false,
            error:
              "The wallet portion of this refund has already been completed.",
          },
          {
            status: 400,
          }
        );
      }

      if (error.message === "REFUND_HAS_NO_WALLET_PORTION") {
        return NextResponse.json(
          {
            success: false,
            error: "This refund has no wallet portion to credit.",
          },
          { status: 400 }
        );
      }

      if (error.message === "REFUND_AMOUNT_MISMATCH") {
        return NextResponse.json(
          {
            success: false,
            error:
              "The wallet credit must equal the recorded wallet portion of this refund.",
          },
          { status: 400 }
        );
      }

      if (error.message === "CANNOT_CREDIT_ADMIN") {
        return NextResponse.json(
          {
            success: false,
            error:
              "Admin accounts cannot be credited through customer wallet management.",
          },
          {
            status: 400,
          }
        );
      }

      if (error.message === "INVALID_WALLET_BALANCE") {
        return NextResponse.json(
          {
            success: false,
            error: "The customer's wallet balance is invalid.",
          },
          {
            status: 500,
          }
        );
      }
    }

    /*
     * ========================================
     * UNKNOWN ERROR
     * ========================================
     */

    console.error("Admin wallet credit error:", error);

    return NextResponse.json(
      {
        success: false,
        error: "Unable to add wallet credits.",
      },
      {
        status: 500,
      }
    );
  }
});
