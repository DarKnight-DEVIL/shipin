import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  addDoc,
  serverTimestamp,
  increment,
  query,
  where,
  orderBy,
  getDocs,
} from 'firebase/firestore';

import { db } from '@/lib/firebase';
import { toShipINError, PaymentError, NotFoundError } from '@/utils/errors';

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

/* =========================================
   WALLET OPERATIONS
========================================= */

export async function depositToWallet(
  userId: string,
  amount: number,
  description = 'Wallet Deposit'
): Promise<void> {
  try {
    if (amount <= 0) {
      throw new PaymentError('Deposit amount must be positive.');
    }

    const walletRef = doc(db, 'wallets', userId);

    await updateDoc(walletRef, {
      balance: increment(amount),
      updatedAt: serverTimestamp(),
    });

    const wallet = await getWallet(userId);

    await addDoc(collection(db, 'walletTransactions'), {
      userId,
      type: 'deposit',
      amount,
      balanceAfter: wallet.balance,
      description,
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    throw toShipINError(error);
  }
}

export async function deductFromWallet(
  userId: string,
  amount: number,
  requestId?: string
): Promise<void> {
  try {
    if (amount <= 0) {
      throw new PaymentError('Deduction amount must be positive.');
    }

    const wallet = await getWallet(userId);

    if (wallet.balance < amount) {
      throw new PaymentError('Insufficient wallet balance.');
    }

    const walletRef = doc(db, 'wallets', userId);

    await updateDoc(walletRef, {
      balance: increment(-amount),
      updatedAt: serverTimestamp(),
    });

    const updatedWallet = await getWallet(userId);

    await addDoc(collection(db, 'walletTransactions'), {
      userId,
      type: 'payment',
      amount: -amount,
      balanceAfter: updatedWallet.balance,
      requestId,
      description: 'Request Payment',
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    throw toShipINError(error);
  }
}

export async function refundToWallet(
  userId: string,
  amount: number,
  requestId?: string
): Promise<void> {
  try {
    if (amount <= 0) {
      throw new PaymentError('Refund amount must be positive.');
    }

    const walletRef = doc(db, 'wallets', userId);

    await updateDoc(walletRef, {
      balance: increment(amount),
      updatedAt: serverTimestamp(),
    });

    const wallet = await getWallet(userId);

    await addDoc(collection(db, 'walletTransactions'), {
      userId,
      type: 'refund',
      amount,
      balanceAfter: wallet.balance,
      requestId,
      description: 'Refund',
      createdAt: serverTimestamp(),
    });
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