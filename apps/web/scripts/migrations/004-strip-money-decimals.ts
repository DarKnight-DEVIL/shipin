#!/usr/bin/env node
/**
 * Migration 004: remove the decimal money fields now that integer minor units are
 * the only thing anybody reads or writes.
 *
 * Run this ONLY after `MONEY_MINOR_ONLY=1` has been deployed and has been running
 * long enough that no old writer is alive during a rolling deploy. Writers read a
 * document, not a schedule, so the failure mode of running it early is a wallet
 * whose balance is deleted while a decimal-only writer still depends on it.
 *
 * What it removes, per document, and only where the integer field is valid:
 *
 *   wallets/{uid}                  balance, reserved
 *   walletTransactions/{id}        amount, balanceAfter
 *
 * Three properties it refuses to compromise:
 *
 *   - **It never unsets without a valid integer beside it.** A field whose
 *     `…Minor` counterpart is missing or not an integer is kept and reported, so
 *     deleting the decimal can never delete the only record of the money.
 *   - **It agrees with the integer first.** If the two disagree the document is
 *     reported and left whole: that disagreement is the last chance to notice a
 *     bad write, and it disappears the moment the decimal is gone.
 *   - **It is idempotent.** A stripped document has nothing left to match, so a
 *     rerun after a partial failure is inert.
 *
 * A document can be half ready — one field agrees, the other has no integer — so
 * the plan reports `incompleteFields` as a list rather than one status. Stripping
 * the ready field and keeping the other is progress, and each field is independent
 * money.
 *
 * `walletHolds` is deliberately left alone: a hold is deleted when it is consumed
 * and carries a 30-minute TTL, so there is no historical decimal to retire, and
 * removing a live one would only add a way to lose a reservation.
 *
 * Run with:
 *   node --env-file=.env.local scripts/migrations/migration-runner.ts 004-strip-money-decimals --dry-run
 *   node --env-file=.env.local scripts/migrations/migration-runner.ts 004-strip-money-decimals
 */

import { FieldValue, type Firestore } from "firebase-admin/firestore";

import { isMinor, minorFromStored } from "../../src/lib/money.ts";

export const name = "004-strip-money-decimals";

const BATCH_LIMIT = 500;

const WALLET_FIELDS = ["balance", "reserved"] as const;
const TRANSACTION_FIELDS = ["amount", "balanceAfter"] as const;

export interface PlanResult {
  /** Decimal fields to remove. */
  remove: Record<string, unknown>;
  /** Decimal fields kept because no valid integer sits beside them. */
  incompleteFields: string[];
  /** Fields whose integer disagreed with the decimal; the document is left whole. */
  mismatches: string[];
}

/**
 * Decide what one document needs, without touching Firestore.
 *
 * Exported so the outcomes that matter — strip, refuse, report a disagreement —
 * are tested against synthetic documents rather than a live database.
 */
export function planDocument(
  data: Record<string, unknown>,
  fields: readonly string[]
): PlanResult {
  const remove: Record<string, unknown> = {};
  const incompleteFields: string[] = [];
  const mismatches: string[] = [];

  for (const field of fields) {
    const decimal = data[field];
    if (decimal === undefined || decimal === null) continue;

    const minor = data[`${field}Minor`];

    if (!isMinor(minor)) {
      incompleteFields.push(field);
      continue;
    }

    if (minor !== minorFromStored(decimal)) {
      mismatches.push(`${field}Minor`);
      continue;
    }

    remove[field] = FieldValue.delete();
  }

  return { remove, incompleteFields, mismatches };
}

interface RunResult {
  processed: number;
  failed: number;
}

interface Counters {
  stripped: number;
  alreadyStripped: number;
  incomplete: number;
  mismatches: number;
}

async function stripCollection(
  db: Firestore,
  collection: string,
  fields: readonly string[],
  batchSize: number,
  dryRun: boolean,
  counters: Counters
): Promise<number> {
  let cursor: string | undefined;
  let processed = 0;

  for (;;) {
    let query = db.collection(collection).orderBy("__name__").limit(batchSize);
    if (cursor) {
      query = query.startAfter(db.collection(collection).doc(cursor));
    }

    const page = await query.get();
    if (page.empty) break;

    const batch = db.batch();
    let writes = 0;

    for (const document of page.docs) {
      processed += 1;
      cursor = document.id;

      const plan = planDocument(document.data(), fields);

      if (plan.mismatches.length > 0) {
        counters.mismatches += 1;
        console.warn(
          `[004] ${collection}/${document.id}: ${plan.mismatches.join(", ")} disagrees with the decimal; nothing removed`
        );
        continue;
      }

      if (plan.incompleteFields.length > 0) {
        counters.incomplete += 1;
        console.warn(
          `[004] ${collection}/${document.id}: ${plan.incompleteFields.join(", ")} has no integer beside it; kept`
        );
      }

      if (Object.keys(plan.remove).length === 0) {
        if (plan.incompleteFields.length === 0) counters.alreadyStripped += 1;
        continue;
      }

      counters.stripped += 1;

      if (!dryRun) {
        batch.update(document.ref, plan.remove);
        writes += 1;
      }
    }

    if (!dryRun && writes > 0) await batch.commit();
    if (page.size < batchSize) break;
  }

  return processed;
}

export async function up(
  db: Firestore,
  batchSize: number = BATCH_LIMIT,
  dryRun = false
): Promise<RunResult> {
  const counters: Counters = {
    stripped: 0,
    alreadyStripped: 0,
    incomplete: 0,
    mismatches: 0,
  };

  let processed = 0;
  let failed = 0;

  try {
    processed += await stripCollection(
      db,
      "wallets",
      WALLET_FIELDS,
      batchSize,
      dryRun,
      counters
    );
    processed += await stripCollection(
      db,
      "walletTransactions",
      TRANSACTION_FIELDS,
      batchSize,
      dryRun,
      counters
    );
  } catch (error) {
    failed += 1;
    console.error("[004] aborted:", error);
  }

  console.log(
    `[004] ${dryRun ? "would strip" : "stripped"} ${counters.stripped} document(s); ` +
      `${counters.alreadyStripped} already stripped, ` +
      `${counters.mismatches} mismatch(es), ` +
      `${counters.incomplete} incomplete.`
  );

  return { processed, failed };
}
