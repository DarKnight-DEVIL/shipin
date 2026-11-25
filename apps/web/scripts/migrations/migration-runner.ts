#!/usr/bin/env node
/**
 * Firestore Migration Runner
 *
 * Usage:
 *   node --env-file=.env.local scripts/migrations/migration-runner.ts <migration-name> [--dry-run]
 *
 * Each migration is a TypeScript file in scripts/migrations/ that exports:
 *   - name: string
 *   - up: (db: Firestore, batchSize?: number, dryRun?: boolean) => Promise<{ processed: number; failed: number }>
 *   - down?: (db: Firestore) => Promise<void>  // optional rollback
 *
 * `up` must honour `dryRun` by reading and counting without committing. The
 * runner cannot enforce that, and a dry run that silently wrote would be worse
 * than no flag at all.
 *
 * Migrations are tracked in the `migrations` collection to ensure idempotency.
 */

import { getApps, initializeApp, cert, type App } from "firebase-admin/app";
import {
  getFirestore,
  type Firestore,
  FieldValue,
  Timestamp,
} from "firebase-admin/firestore";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { readdirSync } from "node:fs";
import { normalizePrivateKey } from "../../src/lib/privateKey.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const MIGRATIONS_DIR = join(__dirname, "..", "migrations");

interface Migration {
  name: string;
  up: (
    db: Firestore,
    batchSize?: number,
    dryRun?: boolean
  ) => Promise<{ processed: number; failed: number }>;
  down?: (db: Firestore) => Promise<void>;
}

interface MigrationRecord {
  name: string;
  appliedAt: Timestamp;
  status: "completed" | "failed";
  processed?: number;
  failed?: number;
  error?: string;
}

function getAdminApp(): App {
  if (getApps().length > 0) return getApps()[0];

  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const rawPrivateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY;

  if (!projectId || !clientEmail || !rawPrivateKey) {
    throw new Error("Missing Firebase Admin environment variables");
  }

  const privateKey = normalizePrivateKey(rawPrivateKey);

  return initializeApp({
    credential: cert({ projectId, clientEmail, privateKey }),
  });
}

async function getMigrationModule(name: string): Promise<Migration> {
  const filePath = join(MIGRATIONS_DIR, `${name}.ts`);
  const mod = await import(pathToFileURL(filePath).href);
  if (!mod.name || !mod.up) {
    throw new Error(`Migration ${name} must export 'name' and 'up' function`);
  }
  return mod as Migration;
}

async function listMigrations(): Promise<string[]> {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter(
      (f) =>
        f.endsWith(".ts") &&
        !f.endsWith(".d.ts") &&
        // The suite next to 002 and this runner both match `*.ts`; listing
        // them as migrations invites `npm run migrate -- <test>`.
        !f.endsWith(".test.ts") &&
        f !== "migration-runner.ts"
    )
    .map((f) => f.slice(0, -3))
    .sort();
  return files;
}

async function isApplied(db: Firestore, name: string): Promise<boolean> {
  const snap = await db.collection("migrations").doc(name).get();
  if (!snap.exists) return false;
  const data = snap.data();
  return data?.status === "completed";
}

async function markApplied(
  db: Firestore,
  name: string,
  record: Omit<MigrationRecord, "name" | "appliedAt">
): Promise<void> {
  await db
    .collection("migrations")
    .doc(name)
    .set({
      ...record,
      name,
      appliedAt: FieldValue.serverTimestamp(),
    });
}

async function runMigration(
  migration: Migration,
  db: Firestore,
  dryRun: boolean,
  batchSize = 500
): Promise<{ processed: number; failed: number }> {
  console.log(`\n🚀 Running migration: ${migration.name}`);
  console.log(`   Dry run: ${dryRun ? "YES" : "NO"}`);
  console.log(`   Batch size: ${batchSize}`);

  const startTime = Date.now();

  try {
    const result = await migration.up(db, batchSize, dryRun);
    const duration = Date.now() - startTime;

    if (!dryRun) {
      await markApplied(db, migration.name, {
        status: "completed",
        processed: result.processed,
        failed: result.failed,
      });
    }

    console.log(`   ✅ Completed in ${duration}ms`);
    console.log(`   Processed: ${result.processed}, Failed: ${result.failed}`);
    return result;
  } catch (error) {
    const duration = Date.now() - startTime;
    const errMsg = error instanceof Error ? error.message : String(error);

    if (!dryRun) {
      await markApplied(db, migration.name, {
        status: "failed",
        error: errMsg,
      });
    }

    console.error(`   ❌ Failed after ${duration}ms: ${errMsg}`);
    throw error;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const migrationName = args[0];
  const dryRun = args.includes("--dry-run");

  if (!migrationName || migrationName === "--help" || migrationName === "-h") {
    console.log("Usage: node migration-runner.ts <migration-name> [--dry-run]");
    console.log("\nAvailable migrations:");
    const migrations = await listMigrations();
    for (const m of migrations) console.log(`  - ${m}`);
    process.exit(migrationName ? 0 : 1);
  }

  if (migrationName === "list") {
    const migrations = await listMigrations();
    for (const m of migrations) console.log(m);
    process.exit(0);
  }

  try {
    const app = getAdminApp();
    const db = getFirestore(app);

    // Check if migration exists
    const available = await listMigrations();
    if (!available.includes(migrationName)) {
      console.error(`❌ Migration not found: ${migrationName}`);
      console.log("Available:", available.join(", "));
      process.exit(1);
    }

    /*
     * A dry run is read-only, so it stays available after the migration has been
     * applied. That is what makes the backfill's dry run useful as a post-deploy
     * check: rerunning it reports every document whose stored value has drifted
     * since, which is exactly what a dual-write rollout can introduce.
     */
    if (!dryRun && (await isApplied(db, migrationName))) {
      console.log(
        `⚠️  Migration ${migrationName} already applied. Re-run with --dry-run to inspect the data without writing.`
      );
      process.exit(0);
    }

    const migration = await getMigrationModule(migrationName);
    await runMigration(migration, db, dryRun);

    if (dryRun) {
      console.log("\n🔍 Dry run complete. No changes persisted.");
    } else {
      console.log("\n✅ Migration applied successfully!");
    }
  } catch (error) {
    console.error(
      "\n❌ Migration failed:",
      error instanceof Error ? error.message : error
    );
    process.exit(1);
  } finally {
    // Clean up
    const apps = getApps();
    await Promise.all(apps.map((a) => (a as any).delete()));
  }
}

main();
