// One-off admin script: list R2 inspection objects and delete any that
// don't have a corresponding request document in Firestore.
//
// Usage (from repo root):
//   node scripts/cleanup-leaked-inspection-photos.mjs       # dry-run only
//   node scripts/cleanup-leaked-inspection-photos.mjs --execute  # actually delete
//
// This script does NOT modify the upload route or retention purge.
// It is a manually-run cleanup tool for objects leaked before the
// two-phase upload fix was deployed.

import { S3Client, ListObjectsV2Command, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getFirestore } from "firebase-admin/firestore";

// ---- Configuration ----
const R2_BUCKET = process.env.R2_BUCKET_NAME || "shipin-bucket";
const PREFIX = "inspection/"; // only look at inspection/ prefix
const DRY_RUN = !process.argv.includes("--execute");

// ---- Validate env ----
if (!R2_BUCKET) {
  console.error("❌  R2_BUCKET_NAME environment variable is required");
  process.exit(1);
}

// ---- Initialize clients ----
const s3Client = new S3Client({
  region: "auto", // Cloudflare R2 uses region "auto"
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || "",
  },
});

// ---- Helper: extract requestId from R2 key ----
/**
 * Extract the requestId from an R2 key like:
 *   inspection/{requestId}/{uuid}.{ext}
 * Returns the requestId part, or null if the key doesn't match the pattern.
 */
function extractRequestIdFromKey(key) {
  const match = key.match(/^inspection\/([^/]+)\//);
  return match ? match[1] : null;
}

// ---- List all objects under inspection/ ----
async function listInspectionObjects() {
  console.log(`🔎  Listing objects with prefix "${PREFIX}" in bucket "${R2_BUCKET}"...`);

  const command = new ListObjectsV2Command({
    Bucket: R2_BUCKET,
    Prefix: PREFIX,
  });

  const { KeyCount, Contents } = await s3Client.send(command);

  if (KeyCount === 0 || !Contents) {
    console.log("ℹ️  No objects found under inspection/");
    return new Map();
  }

  console.log(`📦  Found ${KeyCount} object(s)`);
  const keyMap = new Map();
  for (const obj of Contents) {
    keyMap.set(obj.Key, obj.LastModified ? new Date(obj.LastModified) : null);
  }
  return keyMap;
}

// ---- Get all request IDs from Firestore ----
async function getAllRequestIds() {
  console.log("🔍  Fetching request IDs from Firestore...");

  const firestore = getFirestore();
  const collRef = firestore.collection("requests");

  // List all docs in the requests collection
  const snapshot = await collRef.get();
  const requestIds = new Set();
  snapshot.forEach((doc) => {
    requestIds.add(doc.id);
  });

  console.log(`📋  Found ${requestIds.size} request document(s) in Firestore`);
  return requestIds;
}

// ---- Main cleanup logic ----
async function main() {
  const objects = await listInspectionObjects();
  const requestIds = await getAllRequestIds();

  if (objects.size === 0) {
    console.log("✅  No inspection objects to check.");
    process.exit(0);
  }

  // Determine which objects have matching request documents
  const orphanKeys = [];
  for (const [key] of objects) {
    const requestId = extractRequestIdFromKey(key);
    if (!requestId || !requestIds.has(requestId)) {
      orphanKeys.push(key);
    }
  }

  if (orphanKeys.length === 0) {
    console.log("✅  All inspection objects have corresponding request documents.");
    process.exit(0);
  }

  console.log(`⚠️  Found ${orphanKeys.length} orphaned inspection photo key(s)`);
  console.log("   (objects whose request document no longer exists in Firestore)\n");

  // Report each orphan
  for (let i = 0; i < orphanKeys.length; i++) {
    const key = orphanKeys[i];
    const lastModified = objects.get(key);
    const dateStr = lastModified ? lastModified.toISOString().split("T")[0] : "unknown date";
    console.log(
      `   ${i + 1}. ${key} (last modified: ${dateStr})`
    );
  }

  if (DRY_RUN) {
    console.log("\n🔍  DRY-RUN MODE: No objects will be deleted.\n");
    console.log("   Re-run with --execute to actually delete these keys.\n");
    process.exit(0);
  }

  // Execute deletion
  console.log(`\n🗑  Preparing to delete ${orphanKeys.length} orphaned key(s)...`);
  let deleted = 0;
  for (const key of orphanKeys) {
    try {
      await s3Client.send(new DeleteObjectCommand({
        Bucket: R2_BUCKET,
        Key: key,
      }));
      deleted++;
      console.log(`   ✓ Deleted: ${key}`);
    } catch (err) {
      console.error(`   ✗ Failed to delete ${key}:`, err.message);
    }
  }

  console.log(`\n✅  Complete: deleted ${deleted}/${orphanKeys.length} key(s).`);
  process.exit(0);
}

main().catch((err) => {
  console.error("❌  Script error:", err);
  process.exit(1);
});