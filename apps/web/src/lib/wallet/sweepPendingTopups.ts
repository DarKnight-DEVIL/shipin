/**
 * Credit wallet top-ups PayPal captured but the app never credited.
 *
 * The capture route writes `capturePending: true` before calling PayPal — the
 * only trace of a charge whose credit failed. Nothing in the app acted on that
 * flag: a crash, a timeout, or a lost response between the capture and the
 * transaction left the customer charged with no ledger entry, and the
 * reconciliation job only reported it.
 *
 * This sweep finishes the job. `settleWalletTopup` verifies the capture against
 * the stored order and keys the ledger on the PayPal capture id, so crediting
 * twice is impossible and an overlap with a live capture is harmless.
 *
 * A VOIDED order clears the flag: PayPal never took the money, so the honest end
 * state is "not pending" rather than a flag that keeps being re-examined.
 */

import type { DocumentData, DocumentReference } from "firebase-admin/firestore";

import {
  readCompletedCapture,
  readOrderState,
  type CompletedCapture,
} from "@/lib/paypal/sweepPendingPayments";

export interface StuckTopup {
  id: string;
  ref: DocumentReference;
  data: DocumentData;
}

export interface TopupSweepDeps {
  /** Top-up orders still carrying the in-flight capture flag. */
  listPendingTopups: () => Promise<StuckTopup[]>;
  fetchOrder: (orderId: string) => Promise<unknown>;
  credit: (
    topup: StuckTopup,
    capture: CompletedCapture
  ) => Promise<{ ok: true; alreadyProcessed: boolean } | { ok: false; error: string }>;
  /** Drop the pending flag for an order PayPal never charged. */
  markAbandoned: (topup: StuckTopup) => Promise<void>;
  log?: (message: string, detail?: Record<string, unknown>) => void;
}

export interface TopupSweepResult {
  scanned: number;
  credited: number;
  alreadyCredited: number;
  abandoned: number;
  pending: number;
  failures: Array<{ topupId: string; error: string }>;
}

export async function sweepPendingTopups(
  deps: TopupSweepDeps
): Promise<TopupSweepResult> {
  const result: TopupSweepResult = {
    scanned: 0,
    credited: 0,
    alreadyCredited: 0,
    abandoned: 0,
    pending: 0,
    failures: [],
  };

  const topups = await deps.listPendingTopups();
  result.scanned = topups.length;

  for (const topup of topups) {
    const orderId = String(topup.data.orderId ?? topup.id);

    try {
      const payload = await deps.fetchOrder(orderId);
      const state = readOrderState(payload);

      if (state === "VOIDED") {
        await deps.markAbandoned(topup);
        result.abandoned += 1;
        continue;
      }

      if (state !== "COMPLETED") {
        result.pending += 1;
        continue;
      }

      const capture = readCompletedCapture(payload);

      if (!capture) {
        result.failures.push({
          topupId: topup.id,
          error: "PayPal reports COMPLETED but no completed capture was found.",
        });
        continue;
      }

      const credited = await deps.credit(topup, capture);

      if (!credited.ok) {
        result.failures.push({ topupId: topup.id, error: credited.error });
        continue;
      }

      if (credited.alreadyProcessed) result.alreadyCredited += 1;
      else result.credited += 1;

      deps.log?.("Credited a wallet top-up PayPal had already captured", {
        topupId: topup.id,
        captureId: capture.captureId,
      });
    } catch (error) {
      result.failures.push({
        topupId: topup.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return result;
}
