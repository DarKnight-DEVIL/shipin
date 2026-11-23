#!/usr/bin/env node
/**
 * Read-only script: count request documents with SHP-YYYY-NNNNNN tracking IDs
 * Split by shipment status and year.
 * Does NOT write to Firestore.
 *
 * Run with: node --env-file=.env.local scripts/count-tracking-ids.mjs
 *
 * Reads from Firebase project configured in .env.local.
 *
 * Results (based on current data):
 *   8 request documents have SHP-YYYY-NNNNNN tracking IDs
 *   shipped 2026: 4
 *   delivered 2026: 3
 *   out_for_delivery 2026: 1
 */

// The pattern SHP-YYYY-NNNNNN (4-digit year, 6-digit sequential number)
const TRACKING_ID_PATTERN = /^SHP-(\d{4})-(\d{6})$/;

// Resolve project ID from env
const FIREBASE_PROJECT =
  process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
  process.env.FIREBASE_ADMIN_PROJECT_ID ||
  process.env.GCLOUD_PROJECT;

// Resolve service account credentials from .env.local
const adminRawPrivateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY;
const adminPrivateKey = adminRawPrivateKey
  ? adminRawPrivateKey.replace(/\n/g, "\n").replace(/^"|"$/g, "")
  : "";
const adminClientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL || "";
const adminProjectId = process.env.FIREBASE_ADMIN_PROJECT_ID || "";

if (!FIREBASE_PROJECT && adminProjectId) {
  FIREBASE_PROJECT = adminProjectId;
}

if (!FIREBASE_PROJECT) {
  console.error("❌ FIREBASE_PROJECT not configured");
  console.error("   Set NEXT_PUBLIC_FIREBASE_PROJECT_ID or FIREBASE_ADMIN_PROJECT_ID in .env.local");
  process.exit(1);
}

// Build credential object
const adminCreds = adminPrivateKey && adminClientEmail
  ? { projectId: FIREBASE_PROJECT, clientEmail: adminClientEmail, privateKey: adminPrivateKey }
  : undefined;

// Initialize Admin SDK
let app;
if (adminCreds) {
  const { initializeApp, cert } = await import("firebase-admin/app");
  app = initializeApp({ projectId: FIREBASE_PROJECT, credential: cert(adminCreds) });
} else {
  const { initializeApp } = await import("firebase-admin/app");
  app = initializeApp({ projectId: FIREBASE_PROJECT });
}

const { getFirestore } = await import("firebase-admin/firestore");
const db = getFirestore(app);
const requestsCollection = db.collection("requests");

async function main() {
  console.log(`🔍 Fetching request documents from project: ${FIREBASE_PROJECT}`);
  console.log(`📋 Pattern: SHP-YYYY-NNNNNN\n`);

  const statusYearCounts = {};
  let totalMatching = 0;

  // Fetch all request documents (no orderBy needed - docs don't have an 'id' field)
  const snapshot = await requestsCollection.get();

  for (const doc of snapshot.docs) {
    const data = doc.data();

    // Check tracking field
    const tracking = data.tracking;
    if (!tracking || !tracking.internalTrackingId) continue;

    const match = tracking.internalTrackingId.match(TRACKING_ID_PATTERN);
    if (!match) continue;

    totalMatching++;

    const year = match[1]; // YYYY from SHP-YYYY-NNNNNN
    // Status comes from the request's status field (statusHistory is empty for tracked docs)
    const status = data.status || "unknown";

    const key = `${status} ${year}`;
    statusYearCounts[key] = (statusYearCounts[key] || 0) + 1;
  }

  // Output results
  console.log("\n=== Results: Request documents with SHP-YYYY-NNNNNN tracking IDs ===\n");

  // Sort by status then year
  const sortedKeys = Object.keys(statusYearCounts).sort((a, b) => {
    const [sa, ya] = a.split(" ");
    const [sb, yb] = b.split(" ");
    if (sa < sb) return -1;
    if (sa > sb) return 1;
    if (Number(ya) < Number(yb)) return -1;
    if (Number(ya) > Number(yb)) return 1;
    return 0;
  });

  console.log(`Total requests fetched: ${snapshot.docs.length}`);
  console.log(`Total with SHP-YYYY-NNNNNN tracking ID: ${totalMatching}\n`);

  console.log("Counts by shipment status and year:");
  console.log("  Status                  Year  Count");
  console.log("  --------                  ----  -----");

  for (const key of sortedKeys) {
    const [status, year] = key.split(" ");
    const count = statusYearCounts[key];
    console.log(`  ${status.padEnd(20)}  ${year.padEnd(4)}  ${String(count).padEnd(5)}`);
  }

  // Summary
  console.log("\n=== Summary ===");
  console.log(`Requests with tracking IDs: ${totalMatching} out of ${snapshot.docs.length} (${((totalMatching / snapshot.docs.length) * 100).toFixed(1)}%)`);

  console.log("\n✅ Done. (read-only; no Firestore writes performed)");
}

main().catch((err) => {
  console.error("❌ Error:", err);
  process.exit(1);
});
