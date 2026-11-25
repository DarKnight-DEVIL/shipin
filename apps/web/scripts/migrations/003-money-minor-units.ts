#!/usr/bin/env node
/**
 * Migration 003: give every wallet and ledger document integer minor units.
 *
 * ADR-0008 makes integer minor units the representation money is stored in. The
 * readers already understand both forms (`storedMinor` prefers a valid
 * `…Minor` field and falls back to the decimal), so this backfill is safe to run
 * before the writers switch: until it has run, a reader simply takes the decimal
 * branch it always took.
 *
 * What it writes:
 *
 *   wallets/{uid}                      balanceMinor
 *   walletTransactions/{id}            amountMinor, balanceAfterMinor
 *
 * Two properties matter more than speed here:
 *
 *   - **Idempotent.** A document that already holds a valid integer `…Minor`
 *     field is skipped, so a rerun after a partial failure is inert.
 *   - **It does not overwrite an existing minor field.** If the existing integer
 *     disagrees with the decimal in the same document, the integer wins (it is
 *     the authoritative value per the ADR) and the document is counted as a
 *     mismatch instead of being "fixed". Silently rewriting a balance that
 *     disagrees with the ledger would destroy the evidence an operator needs.
 *
 * A decimal that cannot be read as money (`NaN`, a malformed string, absent) is
 * counted as unreadable and left alone rather than being zeroed: a wallet with
 * no readable balance is a bug to investigate, not a zero to write.
 *
 * No `down`: removing the minor fields would put these documents back where the
 * readers can only see the decimal, and the fields are what phase 4 depends on.
 *
 * Run with:
 *   node --env-file=.env.local scripts/migrations/migration-runner.ts 003-money-minor-units --dry-run
 *   node --env-file=.env.local scripts/migrations/migration-runner.ts 003-money-minor-units
 */

import { type Firestore } from "firebase-admin/firestore";

import { isMinor, minorFromStored } from "../../src/lib/money.ts";

export const name = "003-money-minor-units";

const BATCH_LIMIT = 500;

/** Amount fields on a wallet document. */
const WALLET_FIELDS = ["balance"] as const;

/** Amount fields on a ledger document. */
const TRANSACTION_FIELDS = ["amount", "balanceAfter"] as const;

export type PlannedFields = Record<string, number>;

export interface PlanResult {
  /** Fields to write. Empty when the document needs nothing. */
  update: PlannedFields;
  /**
   * `already-migrated` when every field already held a valid integer,
   * `unreadable` when a decimal could not be read as money at all.
   */
  skipped?: "already-migrated" | "unreadable";
  /** Field names whose stored integer disagreed with the stored decimal. */
  mismatches: string[];
}

/**
 * Decide what one document needs, without touching Firestore.
 *
 * Exported so the migration's interesting behaviour — skip, mismatch, unreadable
 * — is tested against synthetic documents instead of a live database.
 */
export function planDocument(
  data: Record<string, unknown>,
  fields: readonly string[]
): PlanResult {
  const update: PlannedFields = {};
  const mismatches: string[] = [];
  let unreadable = false;

  for (const field of fields) {
    const minorField = `${field}Minor`;
    const existing = data[minorField];
    const raw = data[field];

    // An absent decimal is a document that never held the amount (a ledger row
    // written by a route that omits `balanceAfter`, say). Nothing to do.
    if (raw === undefined || raw === null) continue;

    const minor = minorFromStored(raw);

    // `minorFromStored` reads anything unusable as zero, which is right for a
    // reader and wrong for a migration: writing 0 over an unreadable balance
    // would erase money. Detect it here instead.
    if (minor === 0 && !readsAsZero(raw)) {
      unreadable = true;
      continue;
    }

    if (isMinor(existing)) {
      if (existing !== minor) mismatches.push(minorField);
      continue;
    }

    update[minorField] = minor;
  }

  if (Object.keys(update).length > 0) return { update, mismatches };
  if (unreadable) return { update, skipped: "unreadable", mismatches };

  return { update, skipped: "already-migrated", mismatches };
}

/** Whether a raw value is genuinely zero money, rather than merely unreadable. */
function readsAsZero(raw: unknown): boolean {
  if (raw === 0) return true;
  if (typeof raw === "string") return raw.trim() === "0" || raw.trim() === "0.00";

  return false;
}

interface RunResult {
  processed: number;
  failed: number;
}

interface Counters {
  written: number;
  alreadyMigrated: number;
  unreadable: number;
  mismatches: number;
}

/**
 * Walk a collection in pages ordered by document id.
 *
 * Ordering by `__name__` is what makes a backfill over documents a query cannot
 * describe (a missing field filters out) reachable at all: every document has an
 * id, so the page cursor never skips a row.
 */
async function backfillCollection(
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
    let query = db
      .collection(collection)
      .orderBy("__name__")
      .limit(batchSize);

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
          `[003] ${collection}/${document.id}: ${plan.mismatches.join(", ")} disagrees with the decimal; left as stored`
        );
      }

      if (plan.skipped === "unreadable") {
        counters.unreadable += 1;
        console.warn(
          `[003] ${collection}/${document.id}: amount is not readable as money; left alone`
        );
        continue;
      }

      if (plan.skipped === "already-migrated") {
        counters.alreadyMigrated += 1;
        continue;
      }

      counters.written += 1;

      if (!dryRun) {
        batch.update(document.ref, plan.update);
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
    written: 0,
    alreadyMigrated: 0,
    unreadable: 0,
    mismatches: 0,
  };

  let processed = 0;
  let failed = 0;

  try {
    processed += await backfillCollection(
      db,
      "wallets",
      WALLET_FIELDS,
      batchSize,
      dryRun,
      counters
    );
    processed += await backfillCollection(
      db,
      "walletTransactions",
      TRANSACTION_FIELDS,
      batchSize,
      dryRun,
      counters
    );
  } catch (error) {
    failed += 1;
    console.error("[003] aborted:", error);
  }

  console.log(
    `[003] ${dryRun ? "would write" : "wrote"} ${counters.written} document(s); ` +
      `${counters.alreadyMigrated} already migrated, ` +
      `${counters.mismatches} mismatch(es), ` +
      `${counters.unreadable} unreadable.`
  );

  return { processed, failed };
}
