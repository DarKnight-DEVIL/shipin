import type { Timestamp } from "firebase/firestore";

export interface Wallet {
  balance: number;

  currency: "USD";

  updatedAt?: Timestamp;

  /** Document schema version for migrations. Default: 1 */
  schemaVersion?: number;
}

export interface WalletTransaction {
  id: string;

  userId: string;

  type: "deposit" | "payment" | "refund" | "credit" | "adjustment";

  amount: number;

  balanceAfter: number;

  description: string;

  requestId?: string;

  createdAt?: Timestamp;
}
