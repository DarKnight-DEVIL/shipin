import {
  doc,
  getDoc,
  setDoc,
  collection,
  query,
  where,
  orderBy,
  getDocs,
  limit,
} from "firebase/firestore";

import { db } from "@/lib/firebaseDb";
import { toShipINError } from "@/utils/errors";
import type { WalletTransaction } from "@/types/wallet";

export interface WalletData {
  balance: number;
  currency: string;
}

export async function getWallet(userId: string): Promise<WalletData> {
  try {
    const ref = doc(db, "wallets", userId);

    const snap = await getDoc(ref);

    if (!snap.exists()) {
      try {
        await setDoc(ref, {
          balance: 0,
          currency: "USD",
        });
      } catch (error) {
        // Two tabs opening the wallet for the first time both see a missing
        // document. The loser's setDoc is an update of the winner's wallet,
        // which the rules deny; that is not a real failure, so read the wallet
        // the other tab created instead of showing an error.
        const raced = await getDoc(ref);
        if (raced.exists()) return raced.data() as WalletData;
        throw error;
      }

      return {
        balance: 0,
        currency: "USD",
      };
    }

    return snap.data() as WalletData;
  } catch (error) {
    throw toShipINError(error);
  }
}

/** Newest transactions loaded by the wallet page. */
export const WALLET_TRANSACTION_LIMIT = 100;

export async function getWalletTransactions(
  userId: string
): Promise<WalletTransaction[]> {
  try {
    const q = query(
      collection(db, "walletTransactions"),
      where("userId", "==", userId),
      orderBy("createdAt", "desc"),
      // firestore-list: internal — the page renders this newest window.
      limit(WALLET_TRANSACTION_LIMIT)
    );

    const snapshot = await getDocs(q);

    return snapshot.docs.map((doc) => ({
      id: doc.id,
      ...(doc.data() as Omit<WalletTransaction, "id">),
    }));
  } catch (error) {
    throw toShipINError(error);
  }
}
