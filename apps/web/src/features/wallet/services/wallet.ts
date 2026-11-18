import {
  doc,
  getDoc,
  setDoc,
  collection,
  query,
  where,
  orderBy,
  getDocs,
} from 'firebase/firestore';

import { db } from "@/lib/firebaseDb";
import { toShipINError } from '@/utils/errors';

export interface WalletData {
  balance: number;
  currency: string;
}

export async function getWallet(userId: string): Promise<WalletData> {
  try {
    const ref = doc(db, 'wallets', userId);

    const snap = await getDoc(ref);

    if (!snap.exists()) {
      await setDoc(ref, {
        balance: 0,
        currency: 'USD',
      });

      return {
        balance: 0,
        currency: 'USD',
      };
    }

    return snap.data() as WalletData;
  } catch (error) {
    throw toShipINError(error);
  }
}

export async function getWalletTransactions(
  userId: string
): Promise<unknown[]> {
  try {
    const q = query(
      collection(db, 'walletTransactions'),
      where('userId', '==', userId),
      orderBy('createdAt', 'desc')
    );

    const snapshot = await getDocs(q);

    return snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));
  } catch (error) {
    throw toShipINError(error);
  }
}