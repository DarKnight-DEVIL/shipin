#!/usr/bin/env node
/**
 * Migration 006: backfill the PayPal refund transaction registry.
 *
 * Refund completion records the PayPal transaction id on the request. The
 * duplicate check used to read only the full-refund field, so the same PayPal
 * refund could be recorded again as a partial refund (or the reverse). New
 * completions write `paypalRefundTransactions/{stableHash(id)}` in the same
 * transaction as the refund, and this backfill gives the existing refunds the
 * same protection.
 *
 * Only the ids are copied; no request document is modified. A rerun is cheap:
 * an id already in the registry is left alone.
 *
 * Run with:
 *   node --env-file=.env.production scripts/migrations/migration-runner.ts 006-paypal-refund-transactions --dry-run
 *   node --env-file=.env.production scripts/migrations/migration-runner.ts 006-paypal-refund-transactions
 */

import type { Firestore } from "firebase-admin/firestore";

import { stableHash } from "../../src/lib/stableHash.ts";

export const name = "006-paypal-refund-transactions";

const BATCH_LIMIT = 450;

export interface RefundTransaction {
  transactionId: string;
  requestId: string;
  kind: "full" | "partial";
  amount: number;
}

function transactionId(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function amount(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

/**
 * Every PayPal refund id recorded on one request document.
 *
 * Partial refunds appear twice: once in the completed `partialRefunds` array
 * and once on `partialRefundOffer`. The map folds those into one entry per id,
 * so a dry run reports transactions rather than fields.
 */
export function collectRefundTransactions(
  requestId: string,
  data: Record<string, unknown>
): RefundTransaction[] {
  const found = new Map<string, RefundTransaction>();

  const add = (
    value: unknown,
    kind: RefundTransaction["kind"],
    refundAmount: unknown
  ) => {
    const id = transactionId(value);
    if (!id || found.has(id)) return;
    found.set(id, {
      transactionId: id,
      requestId,
      kind,
      amount: amount(refundAmount),
    });
  };

  const full = data.refundRequest;
  if (full && typeof full === "object") {
    const refund = full as Record<string, unknown>;
    add(
      refund.paypalRefundTransactionId,
      "full",
      refund.paypalRefundAmount ?? refund.paypalAmount
    );
  }

  const offer = data.partialRefundOffer;
  if (offer && typeof offer === "object") {
    const partial = offer as Record<string, unknown>;
    add(
      partial.paypalRefundTransactionId,
      "partial",
      partial.paypalRefundAmount
    );
  }

  if (Array.isArray(data.partialRefunds)) {
    for (const entry of data.partialRefunds) {
      if (!entry || typeof entry !== "object") continue;
      const refund = entry as Record<string, unknown>;
      add(
        refund.paypalRefundTransactionId,
        "partial",
        refund.paypalRefundAmount
      );
    }
  }

  return [...found.values()];
}

export async function up(
  db: Firestore,
  batchSize: number = BATCH_LIMIT,
  dryRun = false
): Promise<{ processed: number; failed: number }> {
  let processed = 0;
  let failed = 0;
  let registered = 0;
  let alreadyRegistered = 0;
  let cursor: string | undefined;

  for (;;) {
    let query = db.collection("requests").orderBy("__name__").limit(batchSize);
    if (cursor) {
      query = query.startAfter(db.collection("requests").doc(cursor));
    }

    const page = await query.get();
    if (page.empty) break;

    for (const document of page.docs) {
      processed += 1;
      cursor = document.id;

      try {
        const transactions = collectRefundTransactions(
          document.id,
          document.data()
        );

        for (const record of transactions) {
          const registryRef = db
            .collection("paypalRefundTransactions")
            .doc(stableHash(record.transactionId));
          const existing = await registryRef.get();

          if (existing.exists) {
            alreadyRegistered += 1;
            continue;
          }

          registered += 1;
          if (dryRun) continue;

          await registryRef.set({
            ...record,
            migratedAt: new Date(),
          });
        }
      } catch (error) {
        failed += 1;
        console.error(`[006] requests/${document.id}: failed`, error);
      }
    }

    if (page.size < batchSize) break;
  }

  console.log(
    `[006] ${dryRun ? "would register" : "registered"} ${registered} transaction(s); ` +
      `${alreadyRegistered} already registered, ${failed} request(s) failed.`
  );

  return { processed, failed };
}
