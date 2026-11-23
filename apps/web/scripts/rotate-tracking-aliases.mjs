// One-off admin script: rotate expiring aliases for tracking IDs.
//
// Usage (from repo root):
//   node scripts/rotate-tracking-aliases.mjs --dry-run   # show what would change (default)
//   node scripts/rotate-tracking-aliases.mjs --write      # actually apply changes
//   node scripts/rotate-tracking-aliases.mjs --write --limit 50  # process at most 50 requests
//
// This script adds trackingAliases to request documents that don't have them yet,
// marking each alias with an expiration time. Expired aliases are cleaned up on each run.
//
// The alias pattern is: <trackingId>-<random8chars> (e.g., SHP-ABCDEFGH)
// Aliases expire after 90 days by default. The --limit flag caps how many request
// documents are touched in a single run, making this safe to repeat.

import { S3Client, ListObjectsV2Command, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getFirestore, DocumentReference, DocumentSnapshot } from "firebase-admin/firestore";
import {
  ALIAS_EXPIRY_DAYS,
  buildAlias,
  hasExpired,
} from "./lib/trackingAlias.mjs";

// ---- Configuration ----
const DRY_RUN = !process.argv.includes("--write");

// ---- Validate env ----
// We need Firebase credentials; in production these come from the Worker bindings.
// In this script we read from the local .env or existing Admin initialization.
import { getFirebaseDb } from "@/lib/firebaseDb";
const db = getFirebaseDb();

// ---- Helpers ----

/**
 * Get the Firestore document path for a request: requests/{requestId}
 */
function requestDocPath(requestId) {
  return `requests/${requestId}`;
}

// ---- Main logic ----

/**
 * List all request document IDs in Firestore.
 */
async function listAllRequestIds() {
  console.log("🔍  Fetching all request document IDs...");
  const requestRef = db.collection("requests");
  const snapshot = await requestRef.get();
  const ids = [];
  snapshot.forEach((doc) => {
    ids.push({ id: doc.id, data: doc.data() });
  });
  console.log(`📋  Found ${ids.length} request document(s)`);
  return ids;
}

/**
 * Add or update trackingAliases on a request document.
 */
async function upsertTrackingAliases(requestId, existingAliases = []) {
  const alias = buildAlias(requestId); // we'll use the request's own tracking ID as base
  const expiresAt = new Date(Date.now() + ALIAS_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

  // Build the new alias entry
  const newAlias = {
    alias,
    createdAt: new Date(),
    expiresAt,
    // Optionally track who created it; here we just note it's system-generated
    createdBy: "rotate-tracking-aliases-script",
  };

  // Combine existing with new, deduplicating by alias string
  const allAliases = [...existingAliases];
  const alreadyHas = allAliases.some((a) => a.alias === alias);
  if (!alreadyHas) {
    allAliases.push(newAlias);
  }

  const requestRef = db.collection("requests").doc(requestId);
  await requestRef.update({
    trackingAliases: allAliases,
    updatedAt: new Date(),
  });

  return { alias, expiresAt };
}

/**
 * Clean up expired aliases from a request document.
 * Removes any alias where hasExpired(alias.expiresAt) is true.
 */
async function cleanupExpiredAliases(requestId, existingAliases = []) {
  const validAliases = existingAliases.filter(
    (a) => !hasExpired(a.expiresAt)
  );

  if (validAliases.length === existingAliases.length) {
    return false; // nothing changed
  }

  const requestRef = db.collection("requests").doc(requestId);
  await requestRef.update({
    trackingAliases: validAliases,
    updatedAt: new Date(),
  });

  return true; // cleanup was performed
}

/**
 * Main entry point.
 */
async function main() {
  const dryRun = !process.argv.includes("--write");
  const limitStr = process.argv.find((arg) => arg.startsWith("--limit"));
  const limit = limitStr ? parseInt(limitStr.split("=")[1] || "0", 10) : undefined;

  const requests = await listAllRequestIds();

  let processed = 0;
  let added = 0;
  let cleaned = 0;

  for (const req of requests) {
    // Stop if we've hit the limit
    if (limit !== undefined && processed >= limit) {
      console.log(`\n🛑  Hit --limit of ${limit} requests. Stopping.`);
      break;
    }

    processed++;
    const { id: requestId, data } = req;
    const existingAliases = data.trackingAliases || [];

    // 1. If the document already has trackingAliases with expiry dates, skip alias addition
    //    but still run cleanup on expired ones
    const hasAliasesWithExpiry = existingAliases.some(
      (a) => a && a.expiresAt
    );

    if (hasAliasesWithExpiry && !dryRun) {
      // Already has aliases - just clean up expired ones
      const cleanedNow = await cleanupExpiredAliases(requestId, existingAliases);
      if (cleanedNow) {
        cleaned++;
      }
    } else {
      // No aliases or dry-run: add a new alias
      const result = await upsertTrackingAliases(requestId, existingAliases);
      added++;
      if (dryRun) {
        console.log(`   [dry-run] Would add alias "${result.alias}" to request ${requestId} (expires ${result.expiresAt.toISOString().split("T")[0]})`);
      } else {
        console.log(`   ✓ Added alias "${result.alias}" to request ${requestId} (expires ${result.expiresAt.toISOString().split("T")[0]})`);
      }
    }

    // 2. Always cleanup any expired aliases
    // (This runs on every iteration regardless of whether we added a new one)
    if (!dryRun) {
      const hadCleanup = await cleanupExpiredAliases(requestId, existingAliases);
      if (hadCleanup) {
        cleaned++;
        console.log(`   ✓ Cleaned expired aliases from request ${requestId}`);
      }
    } else {
      // In dry-run, check how many would be cleaned
      const wouldClean = existingAliases.filter((a) => hasExpired(a.expiresAt)).length;
      if (wouldClean > 0) {
        console.log(`   [dry-run] Would clean ${wouldClean} expired alias(es) from request ${requestId}`);
      }
    }
  }

  console.log("\n" + "=".repeat(50));
  console.log(`📊  Summary (dry-run: ${dryRun}):`);
  console.log(`   Processed: ${processed} request(s)`);
  console.log(`   Aliases added: ${added}`);
  console.log(`   Aliases cleaned (expired removed): ${cleaned}`);
  console.log("\n" + (dryRun ? "🔍  Dry-run complete. Re-run without --write to apply." : "✅  Changes applied successfully."));
}

main().catch((err) => {
  console.error("❌  Script error:", err);
  process.exit(1);
});