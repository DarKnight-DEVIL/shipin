import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebaseAdmin";
import { calculatePayment } from "@/features/finance/services/calculatePayment";
import type { QuoteBreakdown } from "@/types/request";
import { toShipINError } from "@/utils/errors";
import { minorFromStored, storedMinor, toDecimal } from "@/lib/money";

// ---------------------------------------------------------------------------
// Result type
// ---------------------------------------------------------------------------

export interface WalletPaymentResult {
  success: true;
  transactionId: string;
}

export type WalletPaymentErrorCode =
  | "REQUEST_NOT_FOUND"
  | "ALREADY_PAID"
  | "WALLET_NOT_FOUND"
  | "INSUFFICIENT_BALANCE"
  | "QUOTE_AMOUNT_MISSING";

export interface WalletPaymentError {
  code: WalletPaymentErrorCode;
  message: string;
  status: number;
}

/**
 * A known wallet-payment refusal.
 *
 * Carries the code as a field so the HTTP mapping never depends on an error
 * message: a wrapped or reworded message used to fall through to a 500.
 */
export class WalletPaymentFailure extends Error {
  constructor(public readonly code: WalletPaymentErrorCode) {
    super(code);
    this.name = "WalletPaymentFailure";
  }
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

/**
 * The amount a wallet payment has to settle, taken from the stored quote.
 *
 * The client used to send this number and it was charged as-is, so a request
 * quoted at $500 could be paid with `amount: 1`. It is derived here instead,
 * inside the transaction, with the same helper the PayPal path uses: the
 * quoted grand total plus the gateway fee the quote does not absorb.
 *
 * @throws WalletPaymentFailure QUOTE_AMOUNT_MISSING when there is no quote to
 *         price the payment from, so a half-built request cannot be settled
 *         for nothing.
 */
function quotedDue(request: Record<string, unknown>): number {
  const quote = request.quote as { breakdown?: unknown } | undefined;
  const breakdown = quote?.breakdown;

  if (!breakdown || typeof breakdown !== "object") {
    throw new WalletPaymentFailure("QUOTE_AMOUNT_MISSING");
  }

  const grandTotal = Number((breakdown as { grandTotal?: unknown }).grandTotal);

  // A zero or negative total is not something a customer can settle.
  if (!Number.isFinite(grandTotal) || grandTotal <= 0) {
    throw new WalletPaymentFailure("QUOTE_AMOUNT_MISSING");
  }

  try {
    return calculatePayment({
      breakdown: breakdown as QuoteBreakdown,
      // The wallet is what pays, so nothing is applied from it in the quote.
      walletBalance: 0,
      useWallet: false,
    }).totalPaid;
  } catch {
    // An unusable quote throws inside the calculator; report one cause.
    throw new WalletPaymentFailure("QUOTE_AMOUNT_MISSING");
  }
}

/**
 * Process a wallet-only payment for a shipping request.
 *
 * Runs the balance check and deduction inside a Firestore transaction so
 * concurrent requests cannot double-spend the wallet. This is the
 * server-side equivalent of the old read-then-write batch, which had a
 * classic TOCTOU race: two concurrent calls could both pass the balance
 * check and both deduct, driving the balance negative.
 *
 * The amount is NOT a parameter: it is derived from the stored quote inside
 * the transaction. A caller that could name the amount could settle a $500
 * request with $1, which is what this endpoint did before.
 *
 * @param requestId - The shipping request being paid for.
 * @param userId     - The authenticated customer's UID (must own the request).
 * @returns          - The wallet transaction ID on success.
 * @throws           - A ShipINError subclass for any known failure.
 */
export async function processWalletPayment(
  requestId: string,
  userId: string
): Promise<WalletPaymentResult> {
  const requestRef = adminDb.collection("requests").doc(requestId);
  const walletRef = adminDb.collection("wallets").doc(userId);

  try {
    const result = await adminDb.runTransaction(async (transaction) => {
      const requestSnapshot = await transaction.get(requestRef);
      if (!requestSnapshot.exists) {
        throw new WalletPaymentFailure("REQUEST_NOT_FOUND");
      }

      const request = requestSnapshot.data();

      // Ownership check: the caller must own this request. A stranger's request
      // answers exactly like a missing one — a distinct 403 would confirm that
      // the id exists.
      if (!request || request.userId !== userId) {
        throw new WalletPaymentFailure("REQUEST_NOT_FOUND");
      }

      // Prevent duplicate payment.
      if (request.status === "paid") {
        throw new WalletPaymentFailure("ALREADY_PAID");
      }

      // Price the payment from the stored quote, never from the caller.
      const amount = quotedDue(request);

      // Get wallet.
      const walletSnapshot = await transaction.get(walletRef);
      if (!walletSnapshot.exists) {
        throw new WalletPaymentFailure("WALLET_NOT_FOUND");
      }

      const wallet = walletSnapshot.data();
      /*
       * Minor units (ADR-0008, phase 2): the wallet may hold either the decimal
       * field or the integer one, and the availability check is a subtraction
       * that must not run in floats.
       */
      const currentBalanceMinor = storedMinor(wallet, "balance");
      /*
       * Funds promised to a pending PayPal checkout are not spendable: without
       * this a wallet payment made while a PayPal capture was in flight could
       * drain the balance the capture is about to settle from.
       */
      const reservedMinor = Math.max(0, storedMinor(wallet, "reserved"));
      const availableMinor = currentBalanceMinor - reservedMinor;
      const amountMinor = minorFromStored(amount);

      if (availableMinor < amountMinor) {
        throw new WalletPaymentFailure("INSUFFICIENT_BALANCE");
      }

      const newBalanceMinor = currentBalanceMinor - amountMinor;
      const newBalance = toDecimal(newBalanceMinor);

      // Deduct from wallet.
      // ADR-0008 phase 3: both representations, one atomic write.
      transaction.update(walletRef, {
        balance: newBalance,
        balanceMinor: newBalanceMinor,
        updatedAt: FieldValue.serverTimestamp(),
      });

      // Record wallet transaction.
      const transactionRef = adminDb.collection("walletTransactions").doc();
      transaction.set(transactionRef, {
        userId,
        type: "payment",
        amount: -amount,
        balanceAfter: newBalance,
        amountMinor: -amountMinor,
        balanceAfterMinor: newBalanceMinor,
        requestId,
        description: "Request Payment",
        createdAt: FieldValue.serverTimestamp(),
      });

      // Mark request as paid.
      transaction.update(requestRef, {
        status: "paid",
        payment: {
          provider: "wallet",
          paymentMethod: "wallet",
          orderId: "wallet",
          captureId: null,
          amountPaid: amount,
          walletAmount: amount,
          paypalAmount: 0,
          status: "completed",
          paidAt: FieldValue.serverTimestamp(),
        },
        updatedAt: FieldValue.serverTimestamp(),
      });

      return {
        success: true as const,
        transactionId: transactionRef.id,
      };
    });

    return result;
  } catch (error) {
    // A known refusal keeps its code; anything else is wrapped as internal.
    if (error instanceof WalletPaymentFailure) throw error;
    throw toShipINError(error);
  }
}

/**
 * Map a known wallet payment error to an HTTP response.
 */
export function walletPaymentErrorResponse(
  error: unknown
): { code: string; message: string; status: number } | null {
  if (!(error instanceof WalletPaymentFailure)) return null;

  switch (error.code) {
    case "REQUEST_NOT_FOUND":
      return {
        code: "REQUEST_NOT_FOUND",
        message: "Request not found.",
        status: 404,
      };
    case "QUOTE_AMOUNT_MISSING":
      return {
        code: "QUOTE_AMOUNT_MISSING",
        message: "This request has no quoted amount to pay yet.",
        status: 400,
      };
    case "ALREADY_PAID":
      return {
        code: "ALREADY_PAID",
        message: "This request has already been paid.",
        status: 400,
      };
    case "WALLET_NOT_FOUND":
      return {
        code: "WALLET_NOT_FOUND",
        message: "Wallet not found.",
        status: 400,
      };
    case "INSUFFICIENT_BALANCE":
      return {
        code: "INSUFFICIENT_BALANCE",
        message: "Insufficient wallet balance.",
        status: 400,
      };
    default:
      return null;
  }
}
