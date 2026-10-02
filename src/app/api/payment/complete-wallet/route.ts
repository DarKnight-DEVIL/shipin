import {
  NextRequest,
  NextResponse,
} from "next/server";

import { adminDb } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";

export async function POST(
  req: NextRequest
) {
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

    /*
     * ========================================
     * GET REQUEST
     * ========================================
     */

    const requestRef = adminDb
      .collection("requests")
      .doc(requestId);

    const requestSnapshot =
      await requestRef.get();

    if (!requestSnapshot.exists) {
      return NextResponse.json(
        {
          error: "Request not found.",
        },
        { status: 404 }
      );
    }

    const request =
      requestSnapshot.data();

    const userId =
      request?.userId;

    if (!userId) {
      return NextResponse.json(
        {
          error: "Missing user.",
        },
        { status: 400 }
      );
    }

    /*
     * ========================================
     * GET WALLET
     * ========================================
     */

    const walletRef = adminDb
      .collection("wallets")
      .doc(userId);

    const walletSnapshot =
      await walletRef.get();

    if (!walletSnapshot.exists) {
      return NextResponse.json(
        {
          error:
            "Wallet not found.",
        },
        { status: 400 }
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
      return NextResponse.json(
        {
          error:
            "Insufficient wallet balance.",
        },
        { status: 400 }
      );
    }

    /*
     * ========================================
     * PREVENT DUPLICATE PAYMENT
     * ========================================
     */

    if (request?.status === "paid") {
      return NextResponse.json(
        {
          error:
            "This request has already been paid.",
        },
        { status: 400 }
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
     * ========================================
     * ATOMIC WALLET PAYMENT
     * ========================================
     */

    const batch =
      adminDb.batch();

    /*
     * Deduct wallet.
     */
    batch.update(
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

    batch.set(
      transactionRef,
      {
        userId,

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

    batch.update(
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

    await batch.commit();

    /*
     * ========================================
     * SUCCESS
     * ========================================
     */

    return NextResponse.json({
      success: true,
    });

  } catch (error) {
    console.error(
      "Wallet payment error:",
      error
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to complete payment.",
      },
      { status: 500 }
    );
  }
}