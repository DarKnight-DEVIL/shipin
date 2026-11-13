import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebaseAdmin";
import { toShipINError } from "@/utils/errors";

// ---------------------------------------------------------------------------
// Result type
// ---------------------------------------------------------------------------

export interface WalletPaymentResult {
  success: true;
  transactionId: string;
}

export interface WalletPaymentError {
  code:
    | "REQUEST_NOT_FOUND"
    | "UNAUTHORIZED_REQUEST"
    | "ALREADY_PAID"
    | "WALLET_NOT_FOUND"
    | "INSUFFICIENT_BALANCE";
  message: string;
  status: number;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

/**
 * Process a wallet-only payment for a shipping request.
 *
 * Runs the balance check and deduction inside a Firestore transaction so
 * concurrent requests cannot double-spend the wallet. This is the
 * server-side equivalent of the old read-then-write batch, which had a
 * classic TOCTOU race: two concurrent calls could both pass the balance
 * check and both deduct, driving the balance negative.
 *
 * @param requestId - The shipping request being paid for.
 * @param amount     - The amount to charge from the wallet.
 * @param userId     - The authenticated customer's UID (must own the request).
 * @returns          - The wallet transaction ID on success.
 * @throws           - A ShipINError subclass for any known failure.
 */
export async function processWalletPayment(
  requestId: string,
  amount: number,
  userId: string
): Promise<WalletPaymentResult> {
  const requestRef = adminDb.collection("requests").doc(requestId);
  const walletRef = adminDb.collection("wallets").doc(userId);

  try {
    const result = await adminDb.runTransaction(
      async (transaction) => {
        const requestSnapshot = await transaction.get(requestRef);
        if (!requestSnapshot.exists) {
          throw new Error("REQUEST_NOT_FOUND");
        }

        const request = requestSnapshot.data();

        // Ownership check: the caller must own this request.
        if (request?.userId !== userId) {
          throw new Error("UNAUTHORIZED_REQUEST");
        }

        // Prevent duplicate payment.
        if (request?.status === "paid") {
          throw new Error("ALREADY_PAID");
        }

        // Get wallet.
        const walletSnapshot = await transaction.get(walletRef);
        if (!walletSnapshot.exists) {
          throw new Error("WALLET_NOT_FOUND");
        }

        const wallet = walletSnapshot.data();
        const currentBalance = wallet?.balance ?? 0;

        if (currentBalance < amount) {
          throw new Error("INSUFFICIENT_BALANCE");
        }

        const newBalance = currentBalance - amount;

        // Deduct from wallet.
        transaction.update(walletRef, {
          balance: newBalance,
          updatedAt: FieldValue.serverTimestamp(),
        });

        // Record wallet transaction.
        const transactionRef = adminDb
          .collection("walletTransactions")
          .doc();
        transaction.set(transactionRef, {
          userId,
          type: "payment",
          amount: -amount,
          balanceAfter: newBalance,
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
      }
    );

    return result;
  } catch (error) {
    throw toShipINError(error);
  }
}

/**
 * Map a known wallet payment error to an HTTP response.
 */
export function walletPaymentErrorResponse(
  error: unknown
): { code: string; message: string; status: number } | null {
  if (!(error instanceof Error)) return null;

  switch (error.message) {
    case "REQUEST_NOT_FOUND":
      return { code: "REQUEST_NOT_FOUND", message: "Request not found.", status: 404 };
    case "UNAUTHORIZED_REQUEST":
      return {
        code: "UNAUTHORIZED_REQUEST",
        message: "You are not authorized to access this request.",
        status: 403,
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