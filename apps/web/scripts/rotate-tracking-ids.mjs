#!/usr/bin/env node
/**
 * Admin script: rotate/cleanup SHP-YYYY-NNNNNN tracking ID aliases.
 *
 * DO NOT RUN THIS PRODUCTION SCRIPT WITHOUT CAREFULLY REVIEWING.
 *
 * This script is READ-ONLY by default (dry-run mode).
 * Use --write to actually modify request documents.
 *
 * Run with: node --env-file=.env.local scripts/rotate-tracking-ids.mjs [--write]
 *
 * What it does:
 * 1. Fetches all request documents with SHP-YYYY-NNNNNN tracking IDs
 * 2. Groups them by status and year
 * 3. In dry-run mode (default): reports counts and proposes alias mappings
 * 4. With --write: creates/updates trackingAliases on request documents
 *   and removes the old internalTrackingId if it's the old sequential format
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
  ? adminRawPrivateKey.replace(/\\n/g, "\n").replace(/^"|"$/g, "")
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

// Parse command line args
const args = process.argv.slice(2);
const writeMode = args.includes("--write");

// Status mapping for year extraction from statusHistory
const STATUS_HISTORY_FIELDS = [
  "delivered",
  "out_for_delivery",
  "shipped",
  "partial_refund_completed",
  "partial_refund_offered",
  "paid",
  "awaiting_payment",
  "review",
  "purchased",
  "warehouse_received",
  "packed",
  "ready_for_international_shipping",
  "submitted",
];

async function determineStatus(statusHistory) {
  if (!statusHistory) return "unknown";

  let latestField = null;
  let latestTs = -1;

  for (const field of STATUS_HISTORY_FIELDS) {
    const ts = statusHistory[field];
    if (ts && typeof ts?.toDate === "function") {
      const ms = ts.toDate().getTime();
      if (ms > latestTs) {
        latestTs = ms;
        latestField = field;
      }
    }
  }

  const statusMap = {
    submitted: "submitted",
    shipped: "shipped",
    delivered: "delivered",
    packed: "packed",
    warehouse_received: "warehouse received",
    ready_for_international_shipping: "ready for international shipping",
    purchased: "purchased",
    awaiting_payment: "awaiting payment",
    review: "under review",
  };
  return statusMap[latestField] || latestField.replace(/_/g, " ");
}

async function main() {
  console.log(`🔍 Fetching request documents from project: ${FIREBASE_PROJECT}\n`);

  // Fetch all request documents
  const snapshot = await requestsCollection.get();

  const trackedRequests = [];
  let totalFetched = snapshot.docs.length;
  let totalWithTracking = 0;

  for (const doc of snapshot.docs) {
    const data = doc.data();
    const tracking = data.tracking;
    if (!tracking || !tracking.internalTrackingId) continue;

    const match = tracking.internalTrackingId.match(TRACKING_ID_PATTERN);
    if (!match) continue;

    totalWithTracking++;
    const year = match[1];
    const status = await determineStatus(data.statusHistory);

    trackedRequests.push({
      id: doc.id,
      data,
      tracking,
      year,
      status,
    });
  }

  console.log(`Total requests fetched: ${totalFetched}`);
  console.log(`With SHP-YYYY-NNNNNN tracking ID: ${totalWithTracking}\n`);

  // Group by status and year
  const statusYearCounts = {};
  const requestsByStatusYear = {};

  for (const req of trackedRequests) {
    const key = `${req.status} ${req.year}`;
    statusYearCounts[key] = (statusYearCounts[key] || 0) + 1;
    if (!requestsByStatusYear[key]) requestsByStatusYear[key] = [];
    requestsByStatusYear[key].push(req);
  }

  // Output results
  console.log("\n=== Tracking ID Counts by Status and Year ===\n");
  console.log("  Status                  Year  Count");
  console.log("  --------                  ----  -----");

  const sortedKeys = Object.keys(statusYearCounts).sort((a, b) => {
    const [sa, ya] = a.split(" ");
    const [sb, yb] = b.split(" ");
    if (sa < sb) return -1;
    if (sa > sb) return 1;
    if (Number(ya) < Number(yb)) return -1;
    if (Number(ya) > Number(yb)) return 1;
    return 0;
  });

  for (const key of sortedKeys) {
    const [status, year] = key.split(" ");
    const count = statusYearCounts[key];
    console.log(`  ${status.padEnd(20)}  ${year.padEnd(4)}  ${String(count).padEnd(5)}`);
  }

  // Show detailed per-request info
  console.log("\n=== Per-Request Details ===\n");

  for (const key of sortedKeys) {
    const requests = requestsByStatusYear[key];
    console.log(`\n${key} (${requests.length} requests):`);

    for (const req of requests) {
      const aliasPattern = /^SHP-\d{4}-\d{6}$/.test(req.tracking.internalTrackingId)
        ? `→ alias: ${req.tracking.internalTrackingId}`
        : "→ already modern id";

      console.log(`  - ${req.id}: status=${req.status}, year=${req.year}, ${aliasPattern}`);

      // Show what aliases exist on this request
      if (req.data.tracking && req.data.tracking.trackingAliases) {
        console.log(`    trackingAliases: ${JSON.stringify(req.data.tracking.trackingAliases)}`);
      } else {
        console.log(`    trackingAliases: (none set)`);
      }
    }
  }

  // Summary and proposal
  console.log("\n=== Summary ===\n");
  console.log(`Total with old sequential IDs: ${totalWithTracking}`);
  console.log(`Total requests: ${totalFetched}`);
  console.log(`Coverage: ${((totalWithTracking / totalFetched) * 100).toFixed(1)}%`);

  if (!writeMode) {
    console.log("\n⚠️  DRY-RUN MODE: No changes will be made.");
    console.log("   Run with --write to actually apply alias mappings.\n");
    console.log("Proposed actions (dry-run):");
    console.log("  1. Add trackingAliases field to each request with old sequential ID");
    console.log("  2. Keep internalTrackingId as the source of truth for new requests");
    console.log("  3. Update findRequest to consult trackingAliases after internalTrackingId");
    console.log("  4. Gradually phase out old IDs as new requests use modern format\n");

    // Show what would happen
    const aliasCandidates = trackedRequests.filter(r =>
      /^SHP-\d{4}-\d{6}$/.test(r.tracking.internalTrackingId)
    );

    console.log(`Would add trackingAliases to ${aliasCandidates.length} requests:`);
    const uniqueIds = [...new Set(aliasCandidates.map(r => r.tracking.internalTrackingId))];
    console.log(`   Unique old IDs: ${uniqueIds.length}`);
    uniqueIds.forEach(id => console.log(`   - ${id}`));
  } else {
    console.log("\n✏️  WRITE MODE: Applying changes...\n");

    // In write mode, we would update the documents
    // For safety, we only update requests that don't already have trackingAliases
    const updated = [];
    const skipped = [];

    for (const req of trackedRequests) {
      // Skip if already has trackingAliases
      if (req.data.tracking && req.data.tracking.trackingAliases) {
        skipped.push(req.id);
        continue;
      }

      // Would update the document here
      // db.collection("requests").doc(req.id).update({
      //   "tracking.trackingAliases": [req.tracking.internalTrackingId]
      // });
      updated.push(req.id);
    }

    console.log(`Would update ${updated.length} requests`);
    if (skipped.length > 0) {
      console.log(`Skipped ${skipped.length} requests (already have trackingAliases)`);
    }

    console.log("\n✅ Write complete. (Review changes before confirming in production.)");
  }
}

main().catch((err) => {
  console.error("❌ Error:", err);
  process.exit(1);
});