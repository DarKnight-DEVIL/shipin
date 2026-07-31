import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  addDoc,
  serverTimestamp,
  increment,
} from "firebase/firestore";

import { db } from "./firebase";

export async function getWallet(userId: string) {
  const ref = doc(db, "wallets", userId);

  const snap = await getDoc(ref);

  if (!snap.exists()) {
    await setDoc(ref, {
      balance: 0,
      currency: "USD",
    });

    return {
      balance: 0,
      currency: "USD",
    };
  }

  return snap.data();
}

/* =========================================
   WALLET OPERATIONS
========================================= */

export async function depositToWallet(
  userId: string,
  amount: number,
  description = "Wallet Deposit"
) {
  const walletRef = doc(db, "wallets", userId);

  await updateDoc(walletRef, {
    balance: increment(amount),
    updatedAt: serverTimestamp(),
  });

  const wallet = await getWallet(userId);

  await addDoc(collection(db, "walletTransactions"), {
    userId,
    type: "deposit",
    amount,
    balanceAfter: wallet.balance,
    description,
    createdAt: serverTimestamp(),
  });
}

export async function deductFromWallet(
  userId: string,
  amount: number,
  requestId?: string
) {
  const wallet = await getWallet(userId);

  if (wallet.balance < amount) {
    throw new Error("Insufficient wallet balance.");
  }

  const walletRef = doc(db, "wallets", userId);

  await updateDoc(walletRef, {
    balance: increment(-amount),
    updatedAt: serverTimestamp(),
  });

  const updatedWallet = await getWallet(userId);

  await addDoc(collection(db, "walletTransactions"), {
    userId,
    type: "payment",
    amount: -amount,
    balanceAfter: updatedWallet.balance,
    requestId,
    description: "Request Payment",
    createdAt: serverTimestamp(),
  });
}

export async function refundToWallet(
  userId: string,
  amount: number,
  requestId?: string
) {
  const walletRef = doc(db, "wallets", userId);

  await updateDoc(walletRef, {
    balance: increment(amount),
    updatedAt: serverTimestamp(),
  });

  const wallet = await getWallet(userId);

  await addDoc(collection(db, "walletTransactions"), {
    userId,
    type: "refund",
    amount,
    balanceAfter: wallet.balance,
    requestId,
    description: "Refund",
    createdAt: serverTimestamp(),
  });
}

import {
  query,
  where,
  orderBy,
  getDocs,
} from "firebase/firestore";

export async function getWalletTransactions(
  userId: string
) {
  const q = query(
    collection(db, "walletTransactions"),
    where("userId", "==", userId),
    orderBy("createdAt", "desc")
  );

  const snapshot = await getDocs(q);

  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  }));
}