import { collection, doc, getDoc, getDocs } from "firebase/firestore";

import { db } from "@/lib/firebaseDb";
import { toShipINError } from "@/utils/errors";

export interface AdminCustomer {
  id: string;
  displayName: string;
  email: string;
  photoURL?: string;
  role?: string;
  walletBalance: number;
}

export type AdminCustomerFilter = string | null;

export interface RefundRequestDetails {
  id: string;
  userId: string;
  preference: string;
  totalRefundAmount: number;
  walletRefundAmount: number;
}

export async function getCustomersWithWallets(): Promise<AdminCustomer[]> {
  try {
    const [usersSnapshot, walletsSnapshot] = await Promise.all([
      getDocs(collection(db, "users")),
      getDocs(collection(db, "wallets")),
    ]);

    const walletBalances = new Map<string, number>();
    walletsSnapshot.docs.forEach((walletDocument) => {
      const balance = Number(walletDocument.data().balance ?? 0);
      walletBalances.set(
        walletDocument.id,
        Number.isFinite(balance) ? balance : 0
      );
    });

    return usersSnapshot.docs
      .map((userDocument) => {
        const data = userDocument.data();
        return {
          id: userDocument.id,
          displayName: data.displayName || "Unnamed Customer",
          email: data.email || "",
          photoURL: data.photoURL || "",
          role: data.role || "customer",
          walletBalance: walletBalances.get(userDocument.id) ?? 0,
        };
      })
      .filter((customer) => customer.role !== "admin");
  } catch (error) {
    throw toShipINError(error);
  }
}

export async function getRefundRequestDetails(
  requestId: string
): Promise<RefundRequestDetails> {
  try {
    const snapshot = await getDoc(doc(db, "requests", requestId));

    if (!snapshot.exists()) {
      throw new Error("Refund request not found.");
    }

    const data = snapshot.data();
    const preference =
      data.refundRequest?.preference ?? data.preference ?? "wallet";
    const totalRefundAmount = Number(
      data.refundRequest?.amount ?? data.amount ?? 0
    );
    const originalWalletAmount = Number(
      data.refundRequest?.walletAmount ??
        data.payment?.walletAmount ??
        data.walletAmount ??
        0
    );

    let walletRefundAmount = 0;

    if (preference === "wallet") {
      walletRefundAmount = totalRefundAmount;
    } else if (
      preference === "original_sources" ||
      preference === "original_payment"
    ) {
      walletRefundAmount = originalWalletAmount;
    }

    if (!Number.isFinite(walletRefundAmount) || walletRefundAmount <= 0) {
      throw new Error(
        "This refund does not contain a wallet refund amount."
      );
    }

    return {
      id: snapshot.id,
      userId: data.userId ?? "",
      preference,
      totalRefundAmount,
      walletRefundAmount,
    };
  } catch (error) {
    throw toShipINError(error);
  }
}
