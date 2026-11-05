import {
  NextRequest,
  NextResponse,
} from "next/server";

import { adminDb } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";
import { requireAuthWithProfile } from "@/lib/auth";

/**
 * POST /api/payment/complete-wallet
 *
 * Requires an authenticated customer who OWNS the request, and runs the
 * balance-check + deduction inside a Firestore transaction so concurrent
 * requests cannot double-spend the wallet.
 *
 * Previously this endpoint had no auth and used a read-then-write batch,
 * which is a classic TOCTOU race: two concurrent calls could both pass the
 * balance check and both deduct, driving the balance negative.
 */
export async function POST(
  req: NextRequest
) {
  // --- 1. Authenticate the caller ---
  const auth = await requireAuthWithProfile(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const {
      requestId,
      amount,
    } = await req.json();

    if (!requestId || !amount) {
      return NextResponse.json(
        {
          error: "Missing fields",
        },
        { status: 400 }
      );
    }

    const numericAmount = Number(amount);

    if (
      !Number.isFinite(numericAmount) ||
      numericAmount <= 0
    ) {
      return NextResponse.json(
        {
          error:
            "Invalid payment amount.",
        },
        { status: 400 }
      );
    }

    const requestRef = adminDb
      .collection("requests")
      .doc(requestId);

    const walletRef = adminDb
      .collection("wallets")
      .doc(auth.profile.uid);

    /*
     * ========================================
     * ATOMIC WALLET PAYMENT
     * ========================================
     *
     * runTransaction re-reads the request and wallet inside the
     * transaction, so concurrent calls cannot race past the balance
     * check. Firestore will retry automatically on contention.
     */

    const result = await adminDb.runTransaction(
      async (transaction) => {
        const requestSnapshot =
          await transaction.get(
            requestRef
          );

        if (!requestSnapshot.exists) {
          throw new Error(
            "REQUEST_NOT_FOUND"
          );
        }

        const request =
          requestSnapshot.data();

        /*
         * ========================================
         * OWNERSHIP CHECK
         * ========================================
         */

        if (
          request?.userId !==
          auth.profile.uid
        ) {
          throw new Error(
            "UNAUTHORIZED_REQUEST"
          );
        }

        /*
         * ========================================
         * PREVENT DUPLICATE PAYMENT
         * ========================================
         */

        if (request?.status === "paid") {
          throw new Error(
            "ALREADY_PAID"
          );
        }

        /*
         * ========================================
         * GET WALLET
         * ========================================
         */

        const walletSnapshot =
          await transaction.get(
            walletRef
          );

        if (!walletSnapshot.exists) {
          throw new Error(
            "WALLET_NOT_FOUND"
          );
        }

        const wallet =
          walletSnapshot.data();

        const currentBalance =
          Number(wallet?.balance ?? 0);

        /*
         * ========================================
         * VERIFY BALANCE
         * ========================================
         */

        if (
          !Number.isFinite(
            currentBalance
          ) ||
          currentBalance < numericAmount
        ) {
          throw new Error(
            "INSUFFICIENT_BALANCE"
          );
        }

        /*
         * ========================================
         * CALCULATE NEW BALANCE
         * ========================================
         */

        const newBalance =
          currentBalance -
          numericAmount;

        /*
         * Deduct wallet.
         */
        transaction.update(
          walletRef,
          {
            balance: newBalance,

            updatedAt:
              FieldValue.serverTimestamp(),
          }
        );

        /*
         * Record wallet transaction.
         */
        const transactionRef =
          adminDb
            .collection(
              "walletTransactions"
            )
            .doc();

        transaction.set(
          transactionRef,
          {
            userId:
              auth.profile.uid,

            type: "payment",

            amount:
              -numericAmount,

            balanceAfter:
              newBalance,

            requestId,

            description:
              "Request Payment",

            createdAt:
              FieldValue.serverTimestamp(),
          }
        );

        /*
         * ========================================
         * MARK REQUEST PAID
         * ========================================
         *
         * This mirrors markRequestPaid()
         * exactly for a wallet-only payment.
         */

        transaction.update(
          requestRef,
          {
            status: "paid",

            payment: {
              provider: "wallet",

              paymentMethod:
                "wallet",

              orderId:
                "wallet",

              captureId: null,

              amountPaid:
                numericAmount,

              walletAmount:
                numericAmount,

              paypalAmount: 0,

              status: "completed",

              paidAt:
                FieldValue.serverTimestamp(),
            },

            updatedAt:
              FieldValue.serverTimestamp(),
          }
        );

        return {
          success: true,
          transactionId:
            transactionRef.id,
        };
      }
    );

    return NextResponse.json({
      success: result.success,
      transactionId:
        result.transactionId,
    });

  } catch (error) {
    console.error(
      "Wallet payment error:",
      error
    );

    /*
     * ========================================
     * KNOWN ERRORS
     * ========================================
     */

    if (
      error instanceof Error
    ) {
      switch (error.message) {
        case "REQUEST_NOT_FOUND":
          return NextResponse.json(
            {
              error: "Request not found.",
            },
            { status: 404 }
          );
        case "UNAUTHORIZED_REQUEST":
          return NextResponse.json(
            {
              error:
                "You are not authorized to access this request.",
            },
            { status: 403 }
          );
        case "ALREADY_PAID":
          return NextResponse.json(
            {
              error:
                "This request has already been paid.",
            },
            { status: 400 }
          );
        case "WALLET_NOT_FOUND":
          return NextResponse.json(
            {
              error: "Wallet not found.",
            },
            { status: 400 }
          );
        case "INSUFFICIENT_BALANCE":
          return NextResponse.json(
            {
              error:
                "Insufficient wallet balance.",
            },
            { status: 400 }
          );
      }
    }

    return NextResponse.json(
      {
        error: "Internal server error",
      },
      { status: 500 }
    );
  }
}