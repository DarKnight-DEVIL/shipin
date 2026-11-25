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
import { minorFromStored, storedMinor, toDecimal } from "@/lib/money";
import type { PaymentFailure } from "./types";
import {
  deleteConsumedWalletHold,
  reservedAfterRelease,
  WALLET_HOLDS_COLLECTION,
} from "./walletHolds";

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
  const holdRef =
    typeof paymentOrder.walletHoldId === "string" && paymentOrder.walletHoldId
      ? adminDb
          .collection(WALLET_HOLDS_COLLECTION)
          .doc(paymentOrder.walletHoldId)
      : null;

  /*
   * One wallet transaction document per PayPal capture, so a retried capture
   * cannot write its deduction twice.
   */
  const walletTransactionRef = adminDb
    .collection("walletTransactions")
    .doc(`paypal_${captureId}`);

  await adminDb.runTransaction(async (transaction) => {
    // Every read comes before the first write: Firestore rejects the reverse
    // order, and a retried capture must see the current status of all four
    // documents rather than the copy read before the capture call.
    const walletSnapshot = await transaction.get(walletRef);
    const paymentOrderSnapshot = await transaction.get(paymentOrderRef);
    const requestSnapshot = await transaction.get(requestRef);
    const holdSnapshot = holdRef ? await transaction.get(holdRef) : null;

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

    if (!requestSnapshot.exists) {
      throw new Error("Request for this payment could not be found.");
    }

    /*
     * Read the balance through the compat helper (ADR-0008, phase 2): a wallet
     * may hold the decimal field or the integer one, and the debit is
     * arithmetic that must not run in floats.
     */
    const currentBalanceMinor = walletSnapshot.exists
      ? Math.max(0, storedMinor(walletSnapshot.data(), "balance"))
      : 0;
    const walletAppliedMinor = minorFromStored(walletApplied);

    if (walletAppliedMinor > currentBalanceMinor + 1) {
      throw new Error("Insufficient wallet balance to complete this payment.");
    }

    const newBalanceMinor = currentBalanceMinor - walletAppliedMinor;
    const newBalance = toDecimal(newBalanceMinor);

    if (walletApplied > 0) {
      // Consume the reservation in the same write that debits the balance.
      transaction.set(
        walletRef,
        {
          balance: newBalance,
          reserved: reservedAfterRelease(walletSnapshot, holdSnapshot),
          currency: walletSnapshot.exists
            ? walletSnapshot.data()?.currency || "USD"
            : "USD",
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      deleteConsumedWalletHold(transaction, holdRef, holdSnapshot);

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
