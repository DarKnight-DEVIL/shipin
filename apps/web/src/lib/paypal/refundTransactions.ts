import "server-only";

import { adminDb } from "@/lib/firebaseAdmin";
import { stableHash } from "@/lib/stableHash";

/**
 * One document per PayPal refund transaction, written in the same Firestore
 * transaction as the refund itself.
 *
 * Checking the request fields alone only finds a transaction recorded on the
 * field being written now. The same PayPal refund could otherwise be recorded as
 * the full-refund transaction on one request and as a partial-refund transaction
 * on another. A single registry gives both routes one atomic uniqueness check.
 */
export const PAYPAL_REFUND_TRANSACTIONS_COLLECTION =
  "paypalRefundTransactions";

export function paypalRefundTransactionRef(transactionId: string) {
  return adminDb
    .collection(PAYPAL_REFUND_TRANSACTIONS_COLLECTION)
    .doc(stableHash(transactionId));
}
