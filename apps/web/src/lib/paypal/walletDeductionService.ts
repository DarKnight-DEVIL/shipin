/** Wallet balance deduction logic. */
import { adminDb } from "@/lib/firebaseAdmin";
import { adminAuth } from "@/lib/firebaseAuth";

export interface DeductWalletResult {
  ok: boolean;
  error?: {
    message: string;
    status: number;
  };
}

/** Deduct the captured amount from the user's wallet balance. */
export async function deductWallet({
  requestRef,
  paymentOrderRef,
  paymentOrder,
  captureId,
  capturedAmount,
  capturedCurrency,
}: {
  requestRef: any;
  paymentOrderRef: any;
  paymentOrder: any;
  captureId: string;
  capturedAmount: number;
  capturedCurrency: string;
}): Promise<DeductWalletResult> {
  try {
    const userId = paymentOrder.userId;

    if (!userId) {
      return { ok: false, error: { message: "User ID not found on payment order", status: 400 } };
    }

    // Get current user wallet state
    const userDoc = await adminDb.collection("users").doc(userId).get();
    if (!userDoc.exists) {
      return { ok: false, error: { message: "User not found", status: 404 } };
    }

    const userData = userDoc.data();
    const currentBalance = userData?.walletBalance ?? 0;

    // Apply the credit (add captured amount to wallet)
    const newBalance = currentBalance + capturedAmount;

    // Update the user's wallet balance
    await adminDb.collection("users").doc(userId).update({
      walletBalance: newBalance,
    });

    // Mark the payment order as completed
    await paymentOrderRef.update({
      status: "completed",
      captureId,
      capturedAmount: capturedAmount,
      capturedCurrency,
      paidAt: new Date(),
    });

    // Record the transaction
    await adminDb.collection("paymentTransactions").add({
      userId,
      orderId: paymentOrder.requestId,
      amount: capturedAmount,
      currency: capturedCurrency,
      type: "wallet_credit",
      status: "completed",
      createdAt: new Date(),
    });

    return { ok: true };
  } catch (error) {
    console.error("Wallet deduction error:", error);
    return {
      ok: false,
      error: {
        message: error instanceof Error ? error.message : "Failed to deduct wallet",
        status: 500,
      },
    };
  }
}