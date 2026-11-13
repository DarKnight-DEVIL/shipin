/*
 * ========================================
 * ADMIN WALLET CREDIT (SERVER SERVICE)
 * ========================================
 *
 * Business logic for the admin issuing a
 * wallet credit (direct credit or refund
 * portion) toward a customer.
 *
 * Extracted from
 *   src/app/api/admin/wallet/credit/route.ts
 *
 * The route keeps: authorization, request
 * validation and response serialization.
 * This module owns the atomic Firestore
 * transaction and all its rules.
 *
 * Errors are thrown as sentinel messages
 * so the shared error map converts them:
 *
 *   CUSTOMER_NOT_FOUND
 *   CANNOT_CREDIT_ADMIN
 *   REQUEST_NOT_FOUND
 *   REQUEST_CUSTOMER_MISMATCH
 *   REFUND_NOT_REQUESTED
 *   WALLET_REFUND_ALREADY_COMPLETED
 *   INVALID_WALLET_BALANCE
 */

import {
  FieldValue,
  type Firestore,
} from "firebase-admin/firestore";

import { walletBalanceAfterCredit } from "@/features/finance/services/refundMath";

export interface AdminCreditWalletParams {
  customerId: string;
  creditAmount: number;
  description: string;
  requestId: string | null;
  isRefund: boolean;
  adminId: string;
  adminEmail: string | null;
}

export interface AdminCreditWalletResult {
  previousBalance: number;
  creditAdded: number;
  newBalance: number;
  transactionId: string;
}

export async function adminCreditWallet(
  db: Firestore,
  {
    customerId,
    creditAmount,
    description,
    requestId,
    isRefund,
    adminId,
    adminEmail,
  }: AdminCreditWalletParams
): Promise<AdminCreditWalletResult> {
  const customerRef = db
    .collection("users")
    .doc(customerId);

  const walletRef = db
    .collection("wallets")
    .doc(customerId);

  const transactionRef = db
    .collection("walletTransactions")
    .doc();

  const requestRef = requestId
    ? db.collection("requests").doc(requestId)
    : null;

  return db.runTransaction(
    async (transaction) => {
      /*
       * Firestore transactions require
       * all reads before writes.
       */
      const customerSnapshot =
        await transaction.get(customerRef);

      const walletSnapshot =
        await transaction.get(walletRef);

      /*
       * If this is a refund, read the
       * request inside the same transaction.
       */
      const requestSnapshot = requestRef
        ? await transaction.get(requestRef)
        : null;

      /* CUSTOMER */

      if (!customerSnapshot.exists) {
        throw new Error("CUSTOMER_NOT_FOUND");
      }

      const customerData =
        customerSnapshot.data();

      /*
       * Never credit admin accounts.
       */
      if (customerData?.role === "admin") {
        throw new Error("CANNOT_CREDIT_ADMIN");
      }

      /* REFUND REQUEST VALIDATION */

      if (isRefund) {
        if (
          !requestSnapshot ||
          !requestSnapshot.exists
        ) {
          throw new Error("REQUEST_NOT_FOUND");
        }

        const requestData =
          requestSnapshot.data();

        /*
         * Make absolutely sure the request
         * belongs to this user.
         */
        if (
          requestData?.userId !== customerId
        ) {
          throw new Error(
            "REQUEST_CUSTOMER_MISMATCH"
          );
        }

        /*
         * Only an active refund request can
         * be processed.
         */
        if (
          requestData?.refundRequest
            ?.status !== "requested"
        ) {
          throw new Error(
            "REFUND_NOT_REQUESTED"
          );
        }

        /*
         * Prevent accidental double wallet
         * refunds.
         */
        if (
          requestData?.refundRequest
            ?.walletStatus === "completed"
        ) {
          throw new Error(
            "WALLET_REFUND_ALREADY_COMPLETED"
          );
        }
      }

      /* CURRENT BALANCE */

      const currentBalance =
        walletSnapshot.exists
          ? Number(
              walletSnapshot.data()
                ?.balance ?? 0
            )
          : 0;

      if (
        !Number.isFinite(currentBalance) ||
        currentBalance < 0
      ) {
        throw new Error(
          "INVALID_WALLET_BALANCE"
        );
      }

      /* NEW BALANCE */

      const newBalance =
        walletBalanceAfterCredit(
          currentBalance,
          creditAmount
        );

      /* UPDATE WALLET */

      transaction.set(
        walletRef,
        {
          balance: newBalance,

          currency: walletSnapshot.exists
            ? walletSnapshot.data()
                ?.currency || "USD"
            : "USD",

          updatedAt:
            FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      /* AUDIT TRANSACTION */

      transaction.set(transactionRef, {
        userId: customerId,

        type: isRefund
          ? "refund"
          : "admin_credit",

        amount: creditAmount,

        balanceAfter: newBalance,

        description,

        requestId,

        createdAt:
          FieldValue.serverTimestamp(),

        createdBy: adminId,

        createdByEmail: adminEmail ?? null,
      });

      /* MARK REFUND PORTION COMPLETE */

      if (isRefund && requestRef) {
        const requestData =
          requestSnapshot?.data();

        const refundRequest =
          requestData?.refundRequest;

        const walletAmount = Number(
          refundRequest?.walletAmount ??
            refundRequest?.amount ??
            0
        );

        const paypalAmount = Number(
          refundRequest?.paypalAmount ?? 0
        );

        const paypalCompleted =
          refundRequest?.paypalRefundStatus ===
          "completed";

        /*
         * The wallet portion is being
         * completed by this transaction.
         */
        const walletCompleted = true;

        const walletDone =
          walletAmount <= 0 || walletCompleted;

        const paypalDone =
          paypalAmount <= 0 || paypalCompleted;

        const fullyRefunded =
          walletDone && paypalDone;

        transaction.update(
          requestRef,
          {
            "refundRequest.walletStatus":
              "completed",

            "refundRequest.walletAmount":
              creditAmount,

            "refundRequest.walletCompletedAt":
              FieldValue.serverTimestamp(),

            ...(fullyRefunded
              ? {
                  "refundRequest.status":
                    "completed",

                  "refundRequest.processedAt":
                    FieldValue.serverTimestamp(),

                  status: "refunded",

                  "statusHistory.refunded":
                    FieldValue.serverTimestamp(),
                }
              : {}),

            updatedAt:
              FieldValue.serverTimestamp(),
          }
        );
      }

      return {
        previousBalance: currentBalance,
        creditAdded: creditAmount,
        newBalance,
        transactionId: transactionRef.id,
      };
    }
  );
}
