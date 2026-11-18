/**
 * Settle a main-quote payment that PayPal has already captured.
 *
 * The money side of a capture: prove the stored calculation still adds up
 * (total = wallet + PayPal), then mark the request paid and the PayPal order
 * complete in one transaction, deducting the wallet part and writing its ledger
 * entry from inside it.
 *
 * The transaction re-reads the payment order because the capture call between
 * the first read and this write is slow enough for another attempt to finish
 * first; finding it already `completed` is a no-op rather than a double charge.
 */

import {
  FieldValue,
  type DocumentData,
  type DocumentReference,
} from "firebase-admin/firestore";

import { adminDb } from "@/lib/firebaseAdmin";

import { roundMoney, toNumber } from "./amounts";
import type { PaymentFailure } from "./types";

export interface MainPaymentSettlementInput {
  requestRef: DocumentReference;
  paymentOrderRef: DocumentReference;
  paymentOrder: DocumentData;
  requestId: string;
  orderID: string;
  captureId: string;
  capturedAmount: number;
  capturedCurrency: string;
  /** The amount stored on the payment order when it was created. */
  expectedPayPalAmount: number;
}

export type MainPaymentSettlementResult =
  | {
      ok: true;
      paymentMethod: "paypal" | "wallet_and_paypal";
      walletApplied: number;
      totalRequired: number;
      baseAmount: number;
    }
  | PaymentFailure;

export async function settleMainPayment({
  requestRef,
  paymentOrderRef,
  paymentOrder,
  requestId,
  orderID,
  captureId,
  capturedAmount,
  capturedCurrency,
  expectedPayPalAmount,
}: MainPaymentSettlementInput): Promise<MainPaymentSettlementResult> {
  const walletApplied = roundMoney(toNumber(paymentOrder.walletApplied));
  const totalRequired = roundMoney(toNumber(paymentOrder.totalRequired));
  const baseAmount = roundMoney(toNumber(paymentOrder.baseAmount));

  if (baseAmount <= 0 || totalRequired <= 0) {
    return {
      ok: false,
      status: 400,
      error: "The stored payment calculation is invalid.",
    };
  }

  /*
   * Total required − wallet applied must be exactly the PayPal amount. A browser
   * that sent the right amount for a different quote cannot slip through here.
   */
  const calculatedPayPalAmount = roundMoney(totalRequired - walletApplied);

  if (Math.abs(calculatedPayPalAmount - expectedPayPalAmount) > 0.01) {
    console.error("Stored payment calculation mismatch:", {
      baseAmount,
      totalRequired,
      walletApplied,
      calculatedPayPalAmount,
      expectedPayPalAmount,
      orderID,
    });

    return {
      ok: false,
      status: 400,
      error: "The stored payment calculation could not be verified.",
    };
  }

  /*
   * Server-side only: the browser never decides how the payment was split.
   */
  const paymentMethod: "paypal" | "wallet_and_paypal" =
    walletApplied > 0 ? "wallet_and_paypal" : "paypal";

  const walletRef = adminDb.collection("wallets").doc(paymentOrder.userId);

  /*
   * One wallet transaction document per PayPal capture, so a retried capture
   * cannot write its deduction twice.
   */
  const walletTransactionRef = adminDb
    .collection("walletTransactions")
    .doc(`paypal_${captureId}`);

  await adminDb.runTransaction(async (transaction) => {
    const walletSnapshot = await transaction.get(walletRef);
    const paymentOrderSnapshot = await transaction.get(paymentOrderRef);
    await transaction.get(requestRef);

    const currentPaymentOrder = paymentOrderSnapshot.data();

    if (!currentPaymentOrder) {
      throw new Error("PayPal payment order could not be found.");
    }

    if (currentPaymentOrder.status === "completed") {
      return;
    }

    if (currentPaymentOrder.userId !== paymentOrder.userId) {
      throw new Error("Payment ownership verification failed.");
    }

    const currentBalance = walletSnapshot.exists
      ? Math.max(0, toNumber(walletSnapshot.data()?.balance))
      : 0;

    if (walletApplied > currentBalance + 0.01) {
      throw new Error("Insufficient wallet balance to complete this payment.");
    }

    const newBalance = roundMoney(currentBalance - walletApplied);

    if (walletApplied > 0) {
      transaction.set(
        walletRef,
        {
          balance: newBalance,
          currency: walletSnapshot.exists
            ? walletSnapshot.data()?.currency || "USD"
            : "USD",
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      transaction.set(walletTransactionRef, {
        userId: paymentOrder.userId,
        type: "payment",
        amount: -walletApplied,
        balanceAfter: newBalance,
        requestId,
        description: "Request Payment",
        createdAt: FieldValue.serverTimestamp(),
      });
    }

    transaction.update(requestRef, {
      status: "paid",

      payment: {
        provider: paymentMethod,
        paymentMethod,
        orderId: orderID,
        captureId,
        amount: totalRequired,
        amountPaid: totalRequired,
        paypalAmount: capturedAmount,
        walletAmount: walletApplied,
        quoteAmount: baseAmount,
        currency: capturedCurrency,
        status: "completed",
        paidAt: FieldValue.serverTimestamp(),
      },

      updatedAt: FieldValue.serverTimestamp(),
    });

    transaction.update(paymentOrderRef, {
      status: "completed",
      captureId,
      capturedAmount,
      capturedCurrency,
      completedAt: FieldValue.serverTimestamp(),
    });
  });

  return { ok: true, paymentMethod, walletApplied, totalRequired, baseAmount };
}
