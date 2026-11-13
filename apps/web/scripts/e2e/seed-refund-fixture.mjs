#!/usr/bin/env node
/**
 * Seeds a throwaway "purchased" request for the admin refund smoke test.
 *
 * That test moves real money through the wallet and PayPal portions and can
 * only run once per request, so every run needs a fresh fixture. This creates
 * one with random ids and writes nothing to stdout except the `GITHUB_ENV`
 * lines the workflow appends:
 *
 *   node scripts/e2e/seed-refund-fixture.mjs >> "$GITHUB_ENV"
 *
 * It only ever creates documents. Deleting the fixture is left to whoever
 * cleans the staging project; the paths are printed on stderr.
 *
 * ---------------------------------------------------------------------------
 * STAGING ONLY. This writes with admin credentials to whatever Firebase
 * project they belong to. `E2E_SEED_CONFIRM` must equal the project id, so
 * pointing it at production takes a deliberate second mistake.
 * ---------------------------------------------------------------------------
 *
 * Required environment:
 *   FIREBASE_ADMIN_PROJECT_ID, FIREBASE_ADMIN_CLIENT_EMAIL,
 *   FIREBASE_ADMIN_PRIVATE_KEY   staging service account
 *   E2E_SEED_CONFIRM             must equal FIREBASE_ADMIN_PROJECT_ID
 *
 * Optional:
 *   E2E_SEED_WALLET_AMOUNT   wallet portion (default 40)
 *   E2E_SEED_PAYPAL_AMOUNT   PayPal portion (default 60)
 *
 * Usage:
 *   node scripts/e2e/seed-refund-fixture.mjs            # write the fixture
 *   node scripts/e2e/seed-refund-fixture.mjs --dry-run  # print, write nothing
 */
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const DRY_RUN = process.argv.includes('--dry-run');
const CURRENCY = 'USD';

function fail(message) {
  console.error(`seed-refund-fixture: ${message}`);
  process.exit(1);
}

function amountFromEnv(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;

  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    fail(`${name} must be a positive number (got "${raw}").`);
  }
  return Number(value.toFixed(2));
}

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
      'it is the second key on the ignition so staging cannot be confused for production.'
  );
}

const walletAmount = amountFromEnv('E2E_SEED_WALLET_AMOUNT', 40);
const paypalAmount = amountFromEnv('E2E_SEED_PAYPAL_AMOUNT', 60);
const amount = Number((walletAmount + paypalAmount).toFixed(2));

const requestId = `e2e-refund-${randomUUID()}`;
const customerId = `e2e-customer-${randomUUID()}`;

/**
 * Shape the refund endpoints expect: `POST /refund` only accepts a
 * `purchased` request and splits it using `payment.walletAmount` /
 * `payment.paypalAmount`, while `/api/admin/wallet/credit` refuses to credit
 * a `users` document whose role is "admin".
 */
function buildDocuments(now) {
  return {
    // The marker is what lets scripts/e2e/cleanup-refund-fixtures.mjs delete
    // these again without ever touching a real account.
    user: {
      role: 'customer',
      email: `${customerId}@shipin.invalid`,
      displayName: 'E2E Refund Fixture',
      e2eFixture: true,
      createdAt: now,
    },
    wallet: {
      balance: 0,
      currency: CURRENCY,
      e2eFixture: true,
      updatedAt: now,
    },
    request: {
      userId: customerId,
      userEmail: `${customerId}@shipin.invalid`,
      status: 'purchased',
      e2eFixture: true,
      currency: CURRENCY,
      items: [
        {
          name: 'E2E refund fixture item',
          quantity: 1,
          unitPrice: amount,
          subtotal: amount,
        },
      ],
      payment: {
        amount,
        amountPaid: amount,
        walletAmount,
        paypalAmount,
        currency: CURRENCY,
        method: paypalAmount > 0 ? (walletAmount > 0 ? 'mixed' : 'paypal') : 'wallet',
        status: 'paid',
      },
      totalRefundedAmount: 0,
      statusHistory: {
        submitted: now,
        paid: now,
        purchased: now,
      },
      createdAt: now,
      updatedAt: now,
    },
  };
}

async function main() {
  const { cert, initializeApp, getApps } = require('firebase-admin/app');
  const { getFirestore, Timestamp } = require('firebase-admin/firestore');

  const now = Timestamp.now();
  const docs = buildDocuments(now);
  const paths = {
    user: `users/${customerId}`,
    wallet: `wallets/${customerId}`,
    request: `requests/${requestId}`,
  };

  if (DRY_RUN) {
    // Payloads go to stderr so stdout stays valid for `>> "$GITHUB_ENV"`.
    console.error(
      JSON.stringify(
        {
          projectId,
          paths,
          documents: {
            user: { ...docs.user, createdAt: '<serverTimestamp>' },
            wallet: { ...docs.wallet, updatedAt: '<serverTimestamp>' },
            request: { ...docs.request, createdAt: '<serverTimestamp>', updatedAt: '<serverTimestamp>' },
          },
        },
        null,
        2
      )
    );
    // stdout is appended to $GITHUB_ENV by the workflow: keep it to exactly
    // these two lines, and nothing else.
    process.stdout.write(
      `E2E_REFUND_REQUEST_ID=${requestId}\nE2E_REFUND_CUSTOMER_ID=${customerId}\n`
    );
    return;
  }

  if (getApps().length === 0) {
    initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
  }
  const db = getFirestore();

  const batch = db.batch();
  batch.set(db.collection('users').doc(customerId), docs.user);
  batch.set(db.collection('wallets').doc(customerId), docs.wallet);
  batch.set(db.collection('requests').doc(requestId), docs.request);
  await batch.commit();

  // Read it back: a seeded fixture that the deployment cannot see would only
  // fail later, inside the smoke test, with a confusing 404.
  const check = await db.collection('requests').doc(requestId).get();
  const seeded = check.data();
  if (!check.exists || seeded?.status !== 'purchased' || seeded?.userId !== customerId) {
    fail(`the fixture at ${paths.request} did not persist as seeded.`);
  }

  console.error(
    `seeded ${paths.request} (wallet ${walletAmount} / PayPal ${paypalAmount} of ${amount} ${CURRENCY})`
  );
  console.error(
    `cleanup when convenient: delete ${paths.request}, ${paths.user} and ${paths.wallet}`
  );

  // stdout is appended to $GITHUB_ENV by the workflow: keep it to exactly
  // these two lines, and nothing else.
  process.stdout.write(
    `E2E_REFUND_REQUEST_ID=${requestId}\nE2E_REFUND_CUSTOMER_ID=${customerId}\n`
  );
}

main().catch((error) => {
  fail(error instanceof Error ? error.message : String(error));
});
