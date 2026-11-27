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

if (!BUCKET) {
  mkdirSync(BACKUP_DIR, { recursive: true });
  /*
   * A local export dies with the machine: on Cloud Run, Vercel or any
   * container the filesystem is ephemeral, so this "backup" survives only
   * until the next restart. Warn loudly, before the work — a cron log reader
   * should see why the export is not where a backup needs to be.
   */
  console.warn(
    "WARNING: FIREBASE_STORAGE_BUCKET is not set; the export is written to local disk only and will be lost on restart."
  );
}

const destination = BUCKET
  ? `gs://${BUCKET}/firestore-exports/${stamp}`
  : path.join(BACKUP_DIR, `firestore_export_${stamp}`);

const result = spawnSync(
  "firebase",
  [
    "firestore:export",
    /*
     * shell is required on Windows: `firebase` is an .cmd shim, which
     * spawnSync cannot execute directly. The cost of shell is that Node
     * joins the argv array with spaces and no quoting, so an argument with
     * spaces in it is re-split by cmd.exe — a repo checked out under a path
     * like `C:\Users\My Name\shipin` would break the local destination. The
     * destination is therefore quoted here, but only when a shell will see
     * it: on POSIX the argv array goes through execve untouched, and quotes
     * would become part of the argument.
     */
    (process.platform === "win32" ? "\"" : "") +
      destination +
      (process.platform === "win32" ? "\"" : ""),
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
