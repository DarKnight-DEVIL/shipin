#!/usr/bin/env node
/**
 * Migration 007: backfill `customerId` onto support messages.
 *
 * Support messages used to carry only `ticketId`, so the read rule authorised
 * every message with a `get()` of its parent ticket — one extra document read
 * per message in an open thread. New messages denormalise their owner, and this
 * backfill copies the parent ticket's `customerId` onto the existing ones.
 *
 * The field is additive: no message body, sender or timestamp is touched. A
 * rerun is cheap because a message that already names a non-empty owner is left
 * alone. Messages whose ticket no longer exists cannot be resolved and are
 * reported as failures rather than guessed at.
 *
 * Run with:
 *   node --env-file=.env.production scripts/migrations/migration-runner.ts 007-backfill-support-message-customer-id --dry-run
 *   node --env-file=.env.production scripts/migrations/migration-runner.ts 007-backfill-support-message-customer-id
 */

import type { Firestore } from "firebase-admin/firestore";

export const name = "007-backfill-support-message-customer-id";

const BATCH_LIMIT = 450;

function ownerId(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

export async function up(
  db: Firestore,
  batchSize: number = BATCH_LIMIT,
  dryRun = false
): Promise<{ processed: number; failed: number }> {
  let processed = 0;
  let failed = 0;
  let backfilled = 0;
  let alreadyOwned = 0;
  let cursor: string | undefined;

  for (;;) {
    let query = db
      .collection("supportMessages")
      .orderBy("__name__")
      .limit(batchSize);

    if (cursor) {
      query = query.startAfter(db.collection("supportMessages").doc(cursor));
    }

    const page = await query.get();
    if (page.empty) break;

    for (const document of page.docs) {
      processed += 1;
      cursor = document.id;

      try {
        const data = document.data();

        if (ownerId(data.customerId)) {
          alreadyOwned += 1;
          continue;
        }

        const ticketId = ownerId(data.ticketId);

        if (!ticketId) {
          failed += 1;
          console.error(
            `[007] supportMessages/${document.id}: no ticketId, cannot resolve owner`
          );
          continue;
        }

        const ticket = await db
          .collection("supportTickets")
          .doc(ticketId)
          .get();
        const customerId = ownerId(ticket.data()?.customerId);

        if (!ticket.exists || !customerId) {
          failed += 1;
          console.error(
            `[007] supportMessages/${document.id}: ticket ${ticketId} has no owner`
          );
          continue;
        }

        backfilled += 1;
        if (dryRun) continue;

        await document.ref.update({ customerId });
      } catch (error) {
        failed += 1;
        console.error(`[007] supportMessages/${document.id}: failed`, error);
      }
    }

    if (page.size < batchSize) break;
  }

  console.log(
    `[007] ${dryRun ? "would backfill" : "backfilled"} ${backfilled} message(s); ` +
      `${alreadyOwned} already owned, ${failed} unresolved, ${processed} processed.`
  );

  return { processed, failed };
}
