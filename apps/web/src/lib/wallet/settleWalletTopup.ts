/**
 * Credit a wallet top-up that PayPal has already captured.
 *
 * Extracted from the capture route so the recovery sweep can finish the same job
 * without a second copy of the transaction. Two copies of a money write drift,
 * and the failure mode here is a customer charged twice or a ledger entry that
 * does not match the balance beside it.
 *
 * Idempotent by construction: the ledger document is keyed on the PayPal capture
 * id, and a second call finds it and returns `alreadyProcessed` instead of
 * crediting again. That is what lets a sweep run while a browser is retrying.
 */

import {
  FieldValue,
  type DocumentData,
  type DocumentReference,
} from "firebase-admin/firestore";

import { adminDb } from "@/lib/firebaseAdmin";
import { minorFromStored, storedMinor, toDecimal } from "@/lib/money";
import { sameCents } from "@/lib/paypal/amounts";
import { balanceFields, isMinorOnlyMode, ledgerFields } from "@/lib/moneyMode";

export interface WalletCapture {
  captureId: string;
  amount: number;
  currency: string;
}

export type WalletTopupSettlement =
  | { ok: true; alreadyProcessed: boolean; balance: number }
  | { ok: false; error: string; status: number };

export interface WalletTopupSettlementInput {
  topupOrderRef: DocumentReference;
  topupOrder: DocumentData;
  capture: WalletCapture;
}

export async function settleWalletTopup({
  topupOrderRef,
  topupOrder,
  capture,
}: WalletTopupSettlementInput): Promise<WalletTopupSettlement> {
  const storedAmountMinor = storedMinor(topupOrder, "amount");
  const storedAmount = toDecimal(storedAmountMinor);

  if (!Number.isFinite(capture.amount) || capture.amount <= 0) {
    return { ok: false, error: "Invalid PayPal capture amount.", status: 400 };
  }

  if (capture.currency !== "USD") {
    return {
      ok: false,
      error: "Unexpected PayPal payment currency.",
      status: 400,
    };
  }

  if (
    !Number.isFinite(storedAmount) ||
    !sameCents(capturedOrZero(capture), storedAmount)
  ) {
    return {
      ok: false,
      error: "Captured payment amount does not match the wallet top-up.",
      status: 400,
    };
  }

  const userId = String(topupOrder.userId ?? "");
  if (!userId) {
    return { ok: false, error: "Top-up order has no userId.", status: 500 };
  }

  const walletRef = adminDb.collection("wallets").doc(userId);
  const transactionRef = adminDb
    .collection("walletTransactions")
    .doc(capture.captureId);

  const result = await adminDb.runTransaction(async (transaction) => {
    const walletSnapshot = await transaction.get(walletRef);
    const transactionSnapshot = await transaction.get(transactionRef);

    if (transactionSnapshot.exists) {
      const existing = transactionSnapshot.data();

      return {
        alreadyProcessed: true,
        balance: toDecimal(storedMinor(existing, "balanceAfter")),
      };
    }

    /*
     * ADR-0008 phase 3. The minor balance is written as an absolute value rather
     * than an increment: `FieldValue.increment` on a field a legacy wallet does
     * not have starts from zero, which would credit a migrated amount against a
     * balance of nothing. The read above is inside this transaction, so an
     * absolute write is just as atomic as the increment beside it.
     */
    const currentBalanceMinor = storedMinor(walletSnapshot.data(), "balance");
    if (currentBalanceMinor < 0) {
      throw new Error("The wallet balance is negative.");
    }

    const newBalanceMinor =
      currentBalanceMinor + minorFromStored(capture.amount);
    const newBalance = toDecimal(newBalanceMinor);

    if (walletSnapshot.exists) {
      transaction.update(walletRef, {
        // The decimal is an increment, so it cannot come from `balanceFields`;
        // the minor balance is absolute for the reason above.
        ...(isMinorOnlyMode()
          ? {}
          : { balance: FieldValue.increment(capture.amount) }),

        balanceMinor: newBalanceMinor,
        currency: "USD",
        updatedAt: FieldValue.serverTimestamp(),
      });
    } else {
      transaction.set(walletRef, {
        ...balanceFields(newBalanceMinor),
        currency: "USD",
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }

    transaction.set(transactionRef, {
      userId,
      type: "deposit",
      ...ledgerFields(minorFromStored(capture.amount), newBalanceMinor),
      description: "PayPal Wallet Top Up",
      provider: "paypal",
      orderId: String(topupOrder.orderId ?? topupOrderRef.id),
      captureId: capture.captureId,
      currency: capture.currency,
      createdAt: FieldValue.serverTimestamp(),
    });

    transaction.update(topupOrderRef, {
      status: "completed",
      captureId: capture.captureId,
      capturedAmount: capture.amount,
      capturePending: false,
      completedAt: FieldValue.serverTimestamp(),
    });

    return { alreadyProcessed: false, balance: newBalance };
  });

  return { ok: true, ...result };
}

function capturedOrZero(capture: WalletCapture): number {
  return Number.isFinite(capture.amount) ? capture.amount : 0;
}
