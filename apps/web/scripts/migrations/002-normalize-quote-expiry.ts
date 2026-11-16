#!/usr/bin/env node
/**
 * Migration 002: Give every quote a readable expiry and an `expired` flag.
 *
 * The hourly expiry sweep (/api/admin/requests/quotes/expire) finds its work
 * with an indexed range query:
 *
 *   quote.expired == false  AND  quote.expiresAt <= now
 *
 * Two historical shapes are invisible to it, and no query can find them:
 * Firestore filters never match a document that is missing the field, and the
 * range compares against a Timestamp, so a string or numeric expiry sorts
 * outside it.
 *
 *   - quote.expired missing (or not a boolean) — written before every quote
 *     writer set the flag.
 *   - quote.expiresAt not a Timestamp — an ISO string, epoch milliseconds, or a
 *     Timestamp that went through JSON as { seconds, nanoseconds }.
 *
 * Without this backfill those quotes are never marked expired and never notify
 * the customer. They are still refused at payment time, because the payment
 * routes check the expiry themselves, so the cost is a stale flag rather than a
 * live quote.
 *
 * This walks `requests` in pages by document name (the only way to reach rows a
 * query cannot describe), rewrites a readable expiry as a Timestamp, and sets
 * `expired` from that expiry — an already-due quote is stamped expired without
 * emailing the customer about a quote that lapsed weeks ago. Rows whose expiry
 * is absent or unreadable are counted and left alone, matching the sweep.
 *
 * No `down`: the fields it writes are exactly what every current writer
 * produces, so un-setting them would put the rows back outside the sweep.
 *
 * Run with:
 *   node --env-file=.env.local scripts/migrations/migration-runner.ts 002-normalize-quote-expiry --dry-run
 *   node --env-file=.env.local scripts/migrations/migration-runner.ts 002-normalize-quote-expiry
 */

import {
  FieldValue,
  Timestamp,
  type Firestore,
  type QueryDocumentSnapshot,
} from "firebase-admin/firestore";
import { parseQuoteExpiry } from "../../src/features/requests/services/quoteExpiry.js";

export const name = "002-normalize-quote-expiry";

const BATCH_LIMIT = 500;

export async function up(
  db: Firestore,
  batchSize = BATCH_LIMIT,
  dryRun = false
): Promise<{ processed: number; failed: number }> {
  const now = Date.now();

  let processed = 0;
  let failed = 0;
  let rewritten = 0;
  let markedExpired = 0;
  let noExpiry = 0;
  let lastDoc: QueryDocumentSnapshot | null = null;

  while (true) {
    let query = db.collection("requests").orderBy("__name__").limit(batchSize);
    if (lastDoc) query = query.startAfter(lastDoc);

    const snapshot = await query.get();
    if (snapshot.empty) break;

    const batch = db.batch();
    let pending = 0;
    let pageRewritten = 0;
    let pageMarkedExpired = 0;

    for (const doc of snapshot.docs) {
      lastDoc = doc;
      processed++;

      const quote = doc.data().quote as Record<string, unknown> | undefined;

      // Not a quote yet: nothing to normalize.
      if (!quote) continue;

      const expiresAtMs = parseQuoteExpiry(quote.expiresAt);
      if (expiresAtMs === null) {
        noExpiry++;
        continue;
      }

      const patch: Record<string, unknown> = {};

      // Store the expiry in the one shape the sweep can compare against.
      const stored = quote.expiresAt as { toMillis?: unknown } | undefined;
      if (typeof stored?.toMillis !== "function") {
        patch["quote.expiresAt"] = Timestamp.fromMillis(expiresAtMs);
        pageRewritten++;
      }

      if (typeof quote.expired !== "boolean") {
        const isDue = expiresAtMs <= now;
        patch["quote.expired"] = isDue;

        if (isDue) {
          // The instant it was due, not the instant this ran, so the record
          // stays truthful about a quote that lapsed before the backfill.
          patch["quote.expiredAt"] = Timestamp.fromMillis(expiresAtMs);
          pageMarkedExpired++;
        }
      }

      if (Object.keys(patch).length === 0) continue;

      batch.update(doc.ref, { ...patch, updatedAt: FieldValue.serverTimestamp() });
      pending++;
    }

    if (pending > 0) {
      let written = pending;

      if (!dryRun) {
        try {
          await batch.commit();
        } catch (error) {
          written = 0;
          failed += pending;
          console.error(`   ❌ Batch commit failed:`, error);
        }
      }

      if (written > 0) {
        rewritten += pageRewritten;
        markedExpired += pageMarkedExpired;
      }

      console.log(
        `   ${dryRun ? "🔍 Would update" : "✅ Updated"} ${written} (expiry normalized: ${pageRewritten}, marked expired: ${pageMarkedExpired}) — scanned ${processed}`
      );
    }

    if (snapshot.docs.length < batchSize) break;
  }

  console.log(
    `\n   Expiry rewritten: ${rewritten}, marked expired: ${markedExpired}, unreadable expiry: ${noExpiry}`
  );

  return { processed, failed };
}
