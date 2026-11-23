#!/usr/bin/env node
/**
 * Daily Firestore export script.
 *
 * Runs `firebase firestore:export` to create a timestamped backup of the
 * Firestore database. Meant to be run via cron (e.g. daily at midnight).
 *
 * Prerequisites:
 *   - Firebase project configured with `firebase init firestore`
 *   - `FIREBASE_TOKEN` (or a signed-in `gcloud`) and `FIREBASE_PROJECT_ID`
 *   - Firestore emulator not used in production (this exports production data)
 *
 * The export is written under `firestore-backups/` locally; set
 * `FIREBASE_STORAGE_BUCKET` to send it to a Cloud Storage bucket instead, which
 * is what a backup that survives the machine needs.
 *
 * The file previously could not be parsed: the whole source had been collapsed
 * onto line 2 as one escaped string, and it imported `node:date-fns` /
 * `node:fs-extra`, which do not exist. Both are gone — `node:fs` and
 * `Date#toISOString` cover what it needed.
 */

import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";

const PROJECT = process.env.FIREBASE_PROJECT_ID ?? "shipin";
const BUCKET = process.env.FIREBASE_STORAGE_BUCKET;
const BACKUP_DIR = path.resolve("firestore-backups");
const stamp = new Date().toISOString().replace(/[:.]/g, "-").replace(/Z$/, "");

if (!BUCKET) mkdirSync(BACKUP_DIR, { recursive: true });

const destination = BUCKET
  ? `gs://${BUCKET}/firestore-exports/${stamp}`
  : path.join(BACKUP_DIR, `firestore_export_${stamp}`);

const result = spawnSync(
  "firebase",
  [
    "firestore:export",
    destination,
    `--project=${PROJECT}`,
    ...(process.env.FIREBASE_TOKEN
      ? [`--token=${process.env.FIREBASE_TOKEN}`]
      : []),
  ],
  {
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
    shell: process.platform === "win32",
  }
);

if (result.stdout?.trim()) console.log(result.stdout.trim());
if (result.stderr?.trim()) console.error(result.stderr.trim());

if (result.error || result.status !== 0) {
  console.error(
    `Firestore export failed${result.status ? ` with status ${result.status}` : ""}: ${result.error?.message ?? "see stderr"}`
  );
  process.exit(1);
}

console.log(`Firestore export completed: ${destination}`);
