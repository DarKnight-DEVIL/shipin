/**
 * Wallet holds — SERVER ONLY.
 *
 * A PayPal checkout reserves part of the wallet balance at `create-order`
 * (total − PayPal share). Without a reservation the balance was only checked at
 * checkout creation: a second checkout, a wallet-only payment, or any other
 * debit in between could drain it, and the settlement after a successful PayPal
 * capture had nothing left to take. The captured money then covered less than
 * the request's total.
 *
 * The reservation is additive rather than a pre-debit: `wallets/{uid}.reserved`
 * records how much of the balance is promised, and spending paths subtract it.
 * Settlement consumes the hold inside the same transaction that debits the
 * balance, so a retried capture cannot debit twice. A hold whose checkout was
 * abandoned expires and is released on the next `create-order`.
 */

import {
  FieldValue,
  type DocumentData,
  type DocumentReference,
  type DocumentSnapshot,
  type Transaction,
} from "firebase-admin/firestore";

import { adminDb } from "@/lib/firebaseAdmin";

import { roundMoney, toNumber } from "./amounts";

export const WALLET_HOLDS_COLLECTION = "walletHolds";

/** Long enough for a slow PayPal approval, short enough to free abandoned carts. */
export const WALLET_HOLD_TTL_MS = 30 * 60_000;

/**
 * A hold id derived from the checkout's idempotency key, so a retried
 * `create-order` reuses (and recalculates) the same hold instead of stacking a
 * second reservation on the wallet.
 */
export function walletHoldDocId(idempotencyKey: string): string {
  return Buffer.from(idempotencyKey, "utf8").toString("base64url");
}

/** The part of the balance promised to pending checkouts. */
export function reservedBalance(wallet: DocumentData | undefined): number {
  return roundMoney(Math.max(0, toNumber(wallet?.reserved)));
}

/** What the customer can still spend or reserve right now. */
export function availableWalletBalance(
  wallet: DocumentData | undefined
): number {
  return roundMoney(
    Math.max(0, toNumber(wallet?.balance) - reservedBalance(wallet))
  );
}

/**
 * The wallet's `reserved` value once a hold is consumed or released.
 *
 * The caller writes it in the same single wallet write that debits the balance,
 * because Firestore allows only one write per document in a transaction.
 */
export function reservedAfterRelease(
  wallet: DocumentSnapshot,
  hold: DocumentSnapshot | null
): number {
  const current = reservedBalance(wallet.data());
  if (!hold || !hold.exists) return current;

  const data = hold.data() ?? {};
  if (data.status !== "reserved") return current;

  return roundMoney(
    Math.max(0, current - Math.max(0, toNumber(data.amount)))
  );
}

/** Delete a consumed hold. A no-op for a checkout created before holds existed. */
export function deleteConsumedWalletHold(
  transaction: Transaction,
  holdRef: DocumentReference | null,
  hold: DocumentSnapshot | null
): void {
  if (holdRef && hold?.exists) transaction.delete(holdRef);
}

/**
 * Release a hold outside a transaction (the PayPal order was never created).
 * A missing hold is a no-op, so retries are safe.
 */
export async function releaseWalletHold(
  holdId: string,
  userId: string
): Promise<void> {
  const holdRef = adminDb.collection(WALLET_HOLDS_COLLECTION).doc(holdId);
  const walletRef = adminDb.collection("wallets").doc(userId);

  await adminDb.runTransaction(async (transaction) => {
    const hold = await transaction.get(holdRef);
    const wallet = await transaction.get(walletRef);

    if (wallet.exists) {
      transaction.set(
        walletRef,
        {
          reserved: reservedAfterRelease(wallet, hold),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    }

    deleteConsumedWalletHold(transaction, holdRef, hold);
  });
}

/**
 * Free holds from checkouts that were never completed. Called on the next
 * `create-order` so an abandoned PayPal window cannot lock the balance forever.
 * Best effort: a cleanup failure must not block a new checkout.
 */
export async function releaseExpiredWalletHolds(
  now: Date = new Date()
): Promise<number> {
  const holds = adminDb.collection(WALLET_HOLDS_COLLECTION);

  // The unit-test doubles do not model queries; nothing to reconcile there.
  if (typeof holds.where !== "function") return 0;

  // One range filter keeps this on Firestore's automatic single-field index;
  // adding an equality filter here would need a composite index.
  // firestore-list: internal — best-effort sweep on the next checkout, not a list.
  const expired = await holds.where("expiresAt", "<", now).limit(25).get();

  let released = 0;

  for (const hold of expired.docs) {
    const data = hold.data();
    if (data.status !== "reserved") continue;

    const userId = data.userId;
    if (typeof userId !== "string" || !userId) continue;

    try {
      await releaseWalletHold(hold.id, userId);
      released += 1;
    } catch (error) {
      console.error("Could not release an expired wallet hold:", error);
    }
  }

  return released;
}
