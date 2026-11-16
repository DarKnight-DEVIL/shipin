#!/usr/bin/env node
/**
 * Migration 001: Add schemaVersion to core collections
 *
 * This migration adds a `schemaVersion` field (default: 1) to documents in:
 * - users
 * - requests
 * - wallets
 * - walletTransactions
 *
 * Run with:
 *   node --env-file=.env.local scripts/migrations/migration-runner.ts 001-add-schema-version [--dry-run]
 */

import { getFirestore, type Firestore, FieldValue, Timestamp, WriteBatch } from "firebase-admin/firestore";

export const name = "001-add-schema-version";

const COLLECTIONS = ["users", "requests", "wallets", "walletTransactions"] as const;
const BATCH_LIMIT = 500;

export async function up(
  db: Firestore,
  batchSize = BATCH_LIMIT,
  dryRun = false
): Promise<{ processed: number; failed: number }> {
  let totalProcessed = 0;
  let totalFailed = 0;

  for (const collectionName of COLLECTIONS) {
    console.log(`\n📦 Processing ${collectionName}...`);
    const { processed, failed } = await addSchemaVersionToCollection(
      db,
      collectionName,
      batchSize,
      dryRun
    );
    totalProcessed += processed;
    totalFailed += failed;
  }

  return { processed: totalProcessed, failed: totalFailed };
}

async function addSchemaVersionToCollection(
  db: Firestore,
  collectionName: string,
  batchSize: number,
  dryRun: boolean
): Promise<{ processed: number; failed: number }> {
  let processed = 0;
  let failed = 0;
  let lastDoc: any = null;

  while (true) {
    let query = db.collection(collectionName).orderBy("__name__").limit(batchSize);
    if (lastDoc) query = query.startAfter(lastDoc);

    const snapshot = await query.get();
    if (snapshot.empty) break;

    const batch = db.batch();
    let batchCount = 0;

    for (const doc of snapshot.docs) {
      const data = doc.data();
      // Only add schemaVersion if it doesn't exist (idempotent)
      if (data.schemaVersion === undefined) {
        batch.set(doc.ref, { schemaVersion: 1 }, { merge: true });
        batchCount++;
      }
      lastDoc = doc;
      processed++;
    }

    if (batchCount > 0 && dryRun) {
      console.log(`   🔍 Would update ${batchCount} documents (total: ${processed})`);
    } else if (batchCount > 0) {
      try {
        await batch.commit();
        console.log(`   ✅ Committed batch of ${batchCount} documents (total: ${processed})`);
      } catch (error) {
        console.error(`   ❌ Batch commit failed:`, error);
        failed += batchCount;
      }
    }

    if (snapshot.docs.length < batchSize) break;
  }

  return { processed, failed };
}

export async function down(db: Firestore): Promise<void> {
  console.log("⚠️  Rollback: Removing schemaVersion fields...");
  let totalProcessed = 0;

  for (const collectionName of COLLECTIONS) {
    const snapshot = await db.collection(collectionName)
      .where("schemaVersion", "==", 1)
      .limit(1000)
      .get();

    if (!snapshot.empty) {
      const batch = db.batch();
      for (const doc of snapshot.docs) {
        batch.update(doc.ref, { schemaVersion: FieldValue.delete() });
        totalProcessed++;
      }
      await batch.commit();
      console.log(`   Removed schemaVersion from ${snapshot.size} documents in ${collectionName}`);
    }
  }

  console.log(`Rollback complete. Processed ${totalProcessed} documents.`);
}