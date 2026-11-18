/**
 * The capture claim: one attempt at a time may call PayPal's capture endpoint
 * for a given payment order.
 *
 * The status check that used to guard the call was a read-then-act race — two
 * concurrent retries both saw `created` and both asked PayPal to capture. The
 * claim is written in a transaction, so exactly one attempt wins; the others
 * learn that the order is either already complete or currently being processed.
 */

import { type DocumentReference } from "firebase-admin/firestore";

import { adminDb } from "@/lib/firebaseAdmin";

import { toNumber } from "./amounts";

/**
 * How long one attempt may hold the claim before another may take it over.
 * Long enough for a slow PayPal call, short enough that a crashed instance does
 * not leave the order stuck.
 */
export const CAPTURE_CLAIM_LEASE_MS = 2 * 60 * 1000;

export type CaptureClaim = "claimed" | "completed" | "busy";

export async function claimCapture(
  paymentOrderRef: DocumentReference
): Promise<CaptureClaim> {
  return adminDb.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(paymentOrderRef);
    const data = snapshot.data() ?? {};

    if (data.status === "completed") return "completed";

    const claimedAt = toNumber(data.captureClaimedAt);

    if (
      data.status === "capturing" &&
      claimedAt > 0 &&
      Date.now() - claimedAt < CAPTURE_CLAIM_LEASE_MS
    ) {
      return "busy";
    }

    transaction.update(paymentOrderRef, {
      status: "capturing",
      captureClaimedAt: Date.now(),
    });

    return "claimed";
  });
}

/**
 * Hand the claim back after a failed attempt so a retry is not blocked by the
 * lease. Best effort: a failure here only delays the next attempt, which is
 * still better than failing the response the caller is already receiving.
 */
export async function releaseCaptureClaim(
  paymentOrderRef: DocumentReference
): Promise<void> {
  try {
    await adminDb.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(paymentOrderRef);

      if (snapshot.data()?.status !== "capturing") return;

      transaction.update(paymentOrderRef, {
        status: "created",
        captureClaimedAt: null,
      });
    });
  } catch (error) {
    console.error("Could not release the PayPal capture claim:", error);
  }
}
