#!/usr/bin/env node
/**
 * Removes staging fixtures left behind by the admin refund smoke test.
 *
 * Every smoke run consumes one seeded request and leaves it refunded, plus the
 * throwaway user/wallet and any wallet transactions the run created. Without a
 * sweep those accumulate forever, so this deletes them once they are old enough
 * that no in-flight run could still be using them.
 *
 * ---------------------------------------------------------------------------
 * WHAT IT WILL AND WILL NOT TOUCH
 * ---------------------------------------------------------------------------
 * Only documents explicitly marked `e2eFixture: true` are considered, and only
 * `requests` older than E2E_FIXTURE_TTL_HOURS (default 6). For each such
 * request it also deletes:
 *   - walletTransactions whose `requestId` is that request
 *   - users/{userId} and wallets/{userId}, but only if those carry the marker
 * Audit log entries are deliberately left alone: they are audit history and
 * must outlive the data they describe.
 *
 * ---------------------------------------------------------------------------
 * DRY RUN BY DEFAULT. STAGING ONLY.
 * ---------------------------------------------------------------------------
 * Pass `--apply` to actually delete. `E2E_SEED_CONFIRM` must equal
 * FIREBASE_ADMIN_PROJECT_ID, so targeting production takes two mistakes.
 *
 * Required environment:
 *   FIREBASE_ADMIN_PROJECT_ID, FIREBASE_ADMIN_CLIENT_EMAIL,
 *   FIREBASE_ADMIN_PRIVATE_KEY   staging service account
 *   E2E_SEED_CONFIRM             must equal FIREBASE_ADMIN_PROJECT_ID
 *
 * Optional:
 *   E2E_FIXTURE_TTL_HOURS   age before a fixture is swept (default 6)
 *   E2E_FIXTURE_MAX_DELETE  cap per run (default 200)
 *
 * Usage:
 *   node scripts/e2e/cleanup-refund-fixtures.mjs           # report only
 *   node scripts/e2e/cleanup-refund-fixtures.mjs --apply   # delete
 */
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);

const BATCH_LIMIT = 500;

/**
 * A fixture is stale when it carries the marker and was created before the
 * cutoff. Documents without a readable timestamp are skipped: an unknown age
 * is not evidence that a run has finished with it.
 *
 * Exported so the predicate can be exercised without a database.
 */
export function isStaleFixture(data, cutoffMs) {
  if (!data || data.e2eFixture !== true) return false;

  const createdAt = data.createdAt;
  if (!createdAt || typeof createdAt.toMillis !== 'function') return false;

  return createdAt.toMillis() < cutoffMs;
}

function fail(message) {
  console.error(`cleanup-refund-fixtures: ${message}`);
  process.exit(1);
}

function positiveInt(raw, name, fallback) {
  if (raw === undefined || raw === '') return fallback;

  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    fail(`${name} must be a positive integer (got "${raw}").`);
  }
  return value;
}

async function deleteInChunks(db, refs) {
  for (let i = 0; i < refs.length; i += BATCH_LIMIT) {
    const batch = db.batch();
    for (const ref of refs.slice(i, i + BATCH_LIMIT)) batch.delete(ref);
    await batch.commit();
  }
}

async function main() {
  const APPLY = process.argv.includes('--apply');

  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID ?? '';
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL ?? '';
  const privateKey = (process.env.FIREBASE_ADMIN_PRIVATE_KEY ?? '').replace(/\\n/g, '\n');
  const confirm = process.env.E2E_SEED_CONFIRM ?? '';

  if (!projectId || !clientEmail || !privateKey) {
    fail(
      'missing FIREBASE_ADMIN_PROJECT_ID, FIREBASE_ADMIN_CLIENT_EMAIL or FIREBASE_ADMIN_PRIVATE_KEY.'
    );
  }

  if (confirm !== projectId) {
    fail(
      `E2E_SEED_CONFIRM must equal the target project id ("${projectId}") — ` +
        'this sweep deletes documents, so staging must not be confusable with production.'
    );
  }

  const ttlHours = positiveInt(process.env.E2E_FIXTURE_TTL_HOURS, 'E2E_FIXTURE_TTL_HOURS', 6);
  const maxDelete = positiveInt(process.env.E2E_FIXTURE_MAX_DELETE, 'E2E_FIXTURE_MAX_DELETE', 200);
  const cutoff = Date.now() - ttlHours * 60 * 60 * 1000;

  const { cert, initializeApp, getApps } = require('firebase-admin/app');
  const { getFirestore } = require('firebase-admin/firestore');

  if (getApps().length === 0) {
    initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
  }
  const db = getFirestore();

  const snapshot = await db
    .collection('requests')
    .where('e2eFixture', '==', true)
    .limit(BATCH_LIMIT)
    .get();

  const stale = snapshot.docs.filter((doc) => isStaleFixture(doc.data(), cutoff)).slice(0, maxDelete);

  if (stale.length === 0) {
    console.error(
      `no fixtures older than ${ttlHours}h (scanned ${snapshot.size} marked requests); nothing to do.`
    );
    return;
  }

  const plan = [];
  for (const request of stale) {
    const data = request.data();
    const customerId = typeof data.userId === 'string' ? data.userId : '';

    const transactions = await db
      .collection('walletTransactions')
      .where('requestId', '==', request.id)
      .get();

    const refs = [request.ref, ...transactions.docs.map((doc) => doc.ref)];

    if (customerId) {
      for (const collection of ['users', 'wallets']) {
        const doc = await db.collection(collection).doc(customerId).get();
        // Only delete account documents when they are marked fixtures too: a
        // real user must never be swept up because a fixture referenced them.
        if (doc.exists && doc.data()?.e2eFixture === true) {
          refs.push(doc.ref);
        } else if (doc.exists) {
          console.error(`keeping ${collection}/${customerId}: not marked as an e2e fixture.`);
        }
      }
    }

    plan.push({ id: request.id, refs, transactions: transactions.size });
  }

  const totalRefs = plan.reduce((sum, item) => sum + item.refs.length, 0);

  for (const item of plan) {
    console.error(
      `${APPLY ? 'deleting' : 'would delete'} requests/${item.id} ` +
        `(${item.refs.length} docs, ${item.transactions} wallet transactions)`
    );
  }

  if (!APPLY) {
    console.error(
      `${plan.length} stale fixture(s), ${totalRefs} document(s) total — dry run, nothing deleted. ` +
        'Re-run with --apply.'
    );
    return;
  }

  await deleteInChunks(db, plan.flatMap((item) => item.refs));

  console.error(
    `deleted ${plan.length} stale fixture(s), ${totalRefs} document(s) older than ${ttlHours}h.`
  );

  if (stale.length === maxDelete || snapshot.size === BATCH_LIMIT) {
    console.error(
      `hit the ${maxDelete}-fixture cap or the ${BATCH_LIMIT}-document scan limit; ` +
        'run again to sweep the rest.'
    );
  }
}

// Only run when executed directly, so the predicate above stays importable.
const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  main().catch((error) => {
    fail(error instanceof Error ? error.message : String(error));
  });
}
