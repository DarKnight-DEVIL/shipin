import { Timestamp } from "firebase/firestore";

export interface Wallet {
  balance: number;

  currency: "USD";

  updatedAt?: Timestamp;
}

export interface WalletTransaction {
  id: string;

  userId: string;

  type:
    | "deposit"
    | "payment"
    | "refund"
    | "credit"
    | "adjustment";

  amount: number;

  balanceAfter: number;

  description: string;

  requestId?: string;

  createdAt?: Timestamp;
}