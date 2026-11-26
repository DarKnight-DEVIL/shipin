#!/usr/bin/env node
/**
 * Migration 005: move TOTP secrets and backup-code hashes off `users/{uid}`.
 *
 * The running app migrates lazily on the first admin gate or MFA-status request,
 * but a customer who never opens the security screen would keep the secret on a
 * document their browser is allowed to read. This backfill closes that window.
 *
 * It is deliberately one-way and non-destructive to the live factor:
 *
 *   - Existing `userSecrets/{uid}` wins. A secret written after the cutover is
 *     never overwritten by an older copy from the profile.
 *   - Only the secret material moves: `secret`, `backupCodes` and the replay
 *     markers. The public `mfa.totp.enabled` flag stays for the admin list.
 *   - A document with no legacy secret is untouched, so reruns are cheap.
 *
 * Run with:
 *   node --env-file=.env.production scripts/migrations/migration-runner.ts 005-mfa-secrets --dry-run
 *   node --env-file=.env.production scripts/migrations/migration-runner.ts 005-mfa-secrets
 */

import { FieldValue, type Firestore } from "firebase-admin/firestore";

export const name = "005-mfa-secrets";

const BATCH_LIMIT = 450;

/** The secret fields that must never appear on the profile again. */
export const LEGACY_DELETES = [
  "mfa.totp.secret",
  "mfa.totp.backupCodes",
  "mfa.totp.lastTotpCodeHash",
  "mfa.totp.lastTotpVerifiedAt",
  "mfa.totp.lastBackupCodeUsedAt",
] as const;

export interface LegacyTotp {
  secret?: string;
  backupCodes?: string[];
  lastTotpCodeHash?: string;
  lastTotpVerifiedAt?: number;
  lastBackupCodeUsedAt?: number;
}

/**
 * Extract only well-typed secret fields from a profile document.
 *
 * `enabled` is intentionally absent: it is public state and stays put.
 */
export function legacyTotp(data: Record<string, unknown>): LegacyTotp | null {
  const mfa = data.mfa;
  if (typeof mfa !== "object" || mfa === null) return null;

  const totp = (mfa as Record<string, unknown>).totp;
  if (typeof totp !== "object" || totp === null) return null;

  const record = totp as Record<string, unknown>;
  const secret =
    typeof record.secret === "string" && record.secret.length > 0
      ? record.secret
      : undefined;
  const backupCodes = Array.isArray(record.backupCodes)
    ? record.backupCodes.filter(
        (code): code is string => typeof code === "string" && code.length > 0
      )
    : undefined;
  const lastTotpCodeHash =
    typeof record.lastTotpCodeHash === "string" &&
    record.lastTotpCodeHash.length > 0
      ? record.lastTotpCodeHash
      : undefined;
  const lastTotpVerifiedAt =
    typeof record.lastTotpVerifiedAt === "number" &&
    Number.isFinite(record.lastTotpVerifiedAt)
      ? record.lastTotpVerifiedAt
      : undefined;
  const lastBackupCodeUsedAt =
    typeof record.lastBackupCodeUsedAt === "number" &&
    Number.isFinite(record.lastBackupCodeUsedAt)
      ? record.lastBackupCodeUsedAt
      : undefined;

  const extracted: LegacyTotp = {
    ...(secret ? { secret } : {}),
    ...(backupCodes ? { backupCodes } : {}),
    ...(lastTotpCodeHash ? { lastTotpCodeHash } : {}),
    ...(lastTotpVerifiedAt !== undefined ? { lastTotpVerifiedAt } : {}),
    ...(lastBackupCodeUsedAt !== undefined ? { lastBackupCodeUsedAt } : {}),
  };

  return Object.keys(extracted).length > 0 ? extracted : null;
}

function deletes() {
  return Object.fromEntries(
    LEGACY_DELETES.map((field) => [field, FieldValue.delete()])
  );
}

interface Counters {
  migrated: number;
  alreadyMigrated: number;
  untouched: number;
  failed: number;
}

async function migrateDocument(
  db: Firestore,
  uid: string,
  data: Record<string, unknown>,
  dryRun: boolean,
  counters: Counters
): Promise<void> {
  const legacy = legacyTotp(data);
  if (!legacy) {
    counters.untouched += 1;
    return;
  }

  const secretRef = db.collection("userSecrets").doc(uid);
  const existing = await secretRef.get();

  if (existing.exists) {
    // A newer enrollment already wrote the server-only record. Keep it and only
    // remove the stale profile copy.
    counters.alreadyMigrated += 1;
  } else {
    counters.migrated += 1;
  }

  if (dryRun) return;

  if (!existing.exists) {
    await secretRef.set({
      totp: legacy,
      updatedAt: FieldValue.serverTimestamp(),
    });
  }

  await db.collection("users").doc(uid).update(deletes());
}

export async function up(
  db: Firestore,
  batchSize: number = BATCH_LIMIT,
  dryRun = false
): Promise<{ processed: number; failed: number }> {
  const counters: Counters = {
    migrated: 0,
    alreadyMigrated: 0,
    untouched: 0,
    failed: 0,
  };

  let processed = 0;
  let cursor: string | undefined;

  for (;;) {
    let query = db.collection("users").orderBy("__name__").limit(batchSize);
    if (cursor) {
      query = query.startAfter(db.collection("users").doc(cursor));
    }

    const page = await query.get();
    if (page.empty) break;

    for (const document of page.docs) {
      processed += 1;
      cursor = document.id;

      try {
        await migrateDocument(db, document.id, document.data(), dryRun, counters);
      } catch (error) {
        counters.failed += 1;
        console.error(`[005] users/${document.id}: failed`, error);
      }
    }

    if (page.size < batchSize) break;
  }

  console.log(
    `[005] ${dryRun ? "would migrate" : "migrated"} ${counters.migrated} account(s); ` +
      `${counters.alreadyMigrated} already had a server secret, ` +
      `${counters.untouched} had no legacy secret, ${counters.failed} failed.`
  );

  return { processed, failed: counters.failed };
}
