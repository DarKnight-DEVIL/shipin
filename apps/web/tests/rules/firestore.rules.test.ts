/**
 * Firestore security-rules tests, evaluated by the real rules engine.
 *
 * The emulator compiles `firestore.rules` (via `firebase.json`) and decides
 * every request below, so a rules edit that reopens a hole fails this suite.
 * The unit suite's `src/lib/firestoreRules.test.ts` only re-implements the
 * rules as JavaScript closures and cannot do that.
 *
 * Requests go through the emulator's REST API rather than the Firebase SDK:
 * the SDK's compat component registry splits across module instances under
 * Vitest (`Service firestore is not available`), and the rules engine is the
 * thing under test anyway. Auth is an unsigned JWT, which the emulator accepts
 * exactly like the SDK's own `mockUserToken`.
 *
 * Run with `npm run test:rules` (wraps this file in `firebase emulators:exec`).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const PROJECT = 'shipin-rules';
const HOST = `http://127.0.0.1:${process.env.FIRESTORE_EMULATOR_PORT ?? 8080}`;
const DOCS = `${HOST}/v1/projects/${PROJECT}/databases/(default)/documents`;
const CLEAR = `${HOST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`;

const CUSTOMER = 'customer-1';
const OTHER_CUSTOMER = 'customer-2';
const NEW_CUSTOMER = 'customer-3';
const ADMIN = 'admin-1';

/* -------------------------------------------------------------------------- */
/* Emulator plumbing                                                          */
/* -------------------------------------------------------------------------- */

function base64url(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

/**
 * Unsigned ID token for the emulator. It does not verify signatures; it reads
 * `sub`/`user_id` and exposes them as `request.auth.uid`.
 */
function tokenFor(uid: string): string {
  const now = Math.floor(Date.now() / 1000);
  return [
    base64url({ alg: 'none', typ: 'JWT' }),
    base64url({
      iss: `https://securetoken.google.com/${PROJECT}`,
      aud: PROJECT,
      auth_time: now,
      user_id: uid,
      sub: uid,
      iat: now,
      exp: now + 3600,
      firebase: { identities: {}, sign_in_provider: 'custom' },
    }),
    '',
  ].join('.');
}

/** Encode a JS value in the Firestore REST field format. */
function encodeValue(value: unknown): Record<string, unknown> {
  if (value === null) return { nullValue: null };
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') {
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  }
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encodeValue) } };
  if (typeof value === 'object') {
    return { mapValue: { fields: encodeFields(value as Record<string, unknown>) } };
  }
  throw new Error(`Cannot encode ${typeof value} for Firestore`);
}

function encodeFields(doc: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(doc).map(([key, value]) => [key, encodeValue(value)]));
}

type Actor = { uid: string } | 'owner' | 'anonymous';

function headersFor(actor: Actor, withBody = false): Record<string, string> {
  const headers: Record<string, string> = {};
  if (withBody) headers['content-type'] = 'application/json';
  if (actor === 'owner') headers.authorization = 'Bearer owner';
  else if (actor !== 'anonymous') headers.authorization = `Bearer ${tokenFor(actor.uid)}`;
  return headers;
}

/** Create a document; fails with 403 when the rules forbid creation. */
function create(actor: Actor, path: string, data: Record<string, unknown>): Promise<Response> {
  return fetch(`${DOCS}/${path}?currentDocument.exists=false`, {
    method: 'PATCH',
    headers: headersFor(actor, true),
    body: JSON.stringify({ fields: encodeFields(data) }),
  });
}

/** Update an existing document; fails with 403 when the rules forbid it. */
function update(actor: Actor, path: string, data: Record<string, unknown>): Promise<Response> {
  const mask = Object.keys(data)
    .map((field) => `updateMask.fieldPaths=${encodeURIComponent(field)}`)
    .join('&');

  return fetch(`${DOCS}/${path}?currentDocument.exists=true&${mask}`, {
    method: 'PATCH',
    headers: headersFor(actor, true),
    body: JSON.stringify({ fields: encodeFields(data) }),
  });
}

function read(actor: Actor, path: string): Promise<Response> {
  return fetch(`${DOCS}/${path}`, { headers: headersFor(actor) });
}

/** Write a fixture the way trusted server code would, bypassing the rules. */
async function seed(path: string, data: Record<string, unknown>): Promise<void> {
  const response = await fetch(`${DOCS}/${path}`, {
    method: 'PATCH',
    headers: headersFor('owner', true),
    body: JSON.stringify({ fields: encodeFields(data) }),
  });
  expect(response.status).toBe(200);
}

async function expectAllowed(response: Promise<Response>): Promise<void> {
  const resolved = await response;
  expect(resolved.status, await resolved.clone().text()).toBe(200);
}

async function expectDenied(response: Promise<Response>): Promise<void> {
  const resolved = await response;
  expect(resolved.status, await resolved.clone().text()).toBe(403);
}

/* -------------------------------------------------------------------------- */
/* Lifecycle                                                                   */
/* -------------------------------------------------------------------------- */

beforeAll(async () => {
  try {
    await fetch(HOST, { signal: AbortSignal.timeout(2000) });
  } catch {
    throw new Error(
      `Firestore emulator is not reachable at ${HOST}. Run these tests with \`npm run test:rules\`, which starts it.`
    );
  }
});

beforeEach(async () => {
  const cleared = await fetch(CLEAR, { method: 'DELETE' });
  expect(cleared.status).toBe(200);

  // `isAdmin()` resolves the caller's role from this document.
  await seed(`users/${ADMIN}`, { role: 'admin' });
  await seed(`users/${CUSTOMER}`, { role: 'customer', displayName: 'Customer' });
});

afterAll(async () => {
  // Nothing to tear down: `emulators:exec` owns the process.
});

const customer = (): Actor => ({ uid: CUSTOMER });
const anonymous: Actor = 'anonymous';

/* -------------------------------------------------------------------------- */
/* Anonymous access                                                            */
/* -------------------------------------------------------------------------- */

describe('anonymous access', () => {
  it('cannot read a wallet', async () => {
    await seed(`wallets/${CUSTOMER}`, { balance: 10, currency: 'USD' });

    await expectDenied(read(anonymous, `wallets/${CUSTOMER}`));
  });

  it('cannot read a request', async () => {
    await seed(`requests/req-1`, { userId: CUSTOMER, status: 'review' });

    await expectDenied(read(anonymous, 'requests/req-1'));
  });

  it('cannot create a request', async () => {
    await expectDenied(create(anonymous, 'requests/req-anon', { userId: CUSTOMER, status: 'submitted' }));
  });
});

/* -------------------------------------------------------------------------- */
/* users                                                                       */
/* -------------------------------------------------------------------------- */

describe('users', () => {
  it('lets a customer read their own profile', async () => {
    await expectAllowed(read(customer(), `users/${CUSTOMER}`));
  });

  it('blocks reading another customer profile', async () => {
    await expectDenied(read(customer(), `users/${OTHER_CUSTOMER}`));
  });

  it('lets a customer edit cosmetic profile fields', async () => {
    await expectAllowed(update(customer(), `users/${CUSTOMER}`, { displayName: 'Renamed' }));
  });

  it('blocks self-promotion to admin', async () => {
    await expectDenied(update(customer(), `users/${CUSTOMER}`, { role: 'admin' }));
  });

  it('blocks writing MFA state from the client', async () => {
    await expectDenied(
      update(customer(), `users/${CUSTOMER}`, {
        mfa: { totp: { enabled: true, secret: 'attacker-chosen' } },
      })
    );
  });

  it('blocks rewriting an account-state field', async () => {
    await expectDenied(update(customer(), `users/${CUSTOMER}`, { disabled: false }));
  });

  it('blocks creating a profile that claims admin', async () => {
    await expectDenied(
      create({ uid: NEW_CUSTOMER }, `users/${NEW_CUSTOMER}`, {
        displayName: 'New',
        role: 'admin',
      })
    );
  });

  it('allows creating an ordinary customer profile', async () => {
    await expectAllowed(
      create({ uid: NEW_CUSTOMER }, `users/${NEW_CUSTOMER}`, {
        displayName: 'New',
        role: 'customer',
      })
    );
  });
});

/* -------------------------------------------------------------------------- */
/* requests                                                                    */
/* -------------------------------------------------------------------------- */

describe('requests', () => {
  it('lets a customer file their own unpriced request', async () => {
    await expectAllowed(
      create(customer(), 'requests/req-new', {
        userId: CUSTOMER,
        status: 'submitted',
        items: [],
        customerName: 'Customer',
      })
    );
  });

  it('blocks filing a request in someone else name', async () => {
    await expectDenied(
      create(customer(), 'requests/req-new', { userId: OTHER_CUSTOMER, status: 'submitted' })
    );
  });

  it('blocks filing a request that is already paid', async () => {
    await expectDenied(
      create(customer(), 'requests/req-new', {
        userId: CUSTOMER,
        status: 'paid',
        items: [],
      })
    );
  });

  it('blocks filing a request with pricing attached', async () => {
    await expectDenied(
      create(customer(), 'requests/req-new', {
        userId: CUSTOMER,
        status: 'submitted',
        quote: { breakdown: { grandTotal: 1 } },
      })
    );
  });

  it('lets the owner read their own request', async () => {
    await seed('requests/req-1', { userId: CUSTOMER, status: 'awaiting_payment' });

    await expectAllowed(read(customer(), 'requests/req-1'));
  });

  it('blocks reading another customer request', async () => {
    await seed('requests/req-1', { userId: OTHER_CUSTOMER, status: 'awaiting_payment' });

    await expectDenied(read(customer(), 'requests/req-1'));
  });

  it('blocks the owner marking their own request paid', async () => {
    await seed('requests/req-1', {
      userId: CUSTOMER,
      status: 'awaiting_payment',
      quote: { breakdown: { grandTotal: 500 } },
    });

    await expectDenied(update(customer(), 'requests/req-1', { status: 'paid' }));
  });

  it('blocks the owner rewriting the quoted total', async () => {
    await seed('requests/req-1', {
      userId: CUSTOMER,
      status: 'awaiting_payment',
      quote: { breakdown: { grandTotal: 500 } },
    });

    await expectDenied(
      update(customer(), 'requests/req-1', { quote: { breakdown: { grandTotal: 1 } } })
    );
  });

  it('blocks handing a request to another account', async () => {
    await seed('requests/req-1', { userId: CUSTOMER, status: 'review' });

    await expectDenied(update(customer(), 'requests/req-1', { userId: OTHER_CUSTOMER }));
  });

  it('lets an admin read and advance any request', async () => {
    await seed('requests/req-1', { userId: CUSTOMER, status: 'paid' });

    await expectAllowed(read({ uid: ADMIN }, 'requests/req-1'));
    await expectAllowed(update({ uid: ADMIN }, 'requests/req-1', { status: 'purchased' }));
  });
});

/* -------------------------------------------------------------------------- */
/* wallets                                                                     */
/* -------------------------------------------------------------------------- */

describe('wallets', () => {
  it('allows the owner to self-provision an empty wallet', async () => {
    await expectAllowed(create(customer(), `wallets/${CUSTOMER}`, { balance: 0, currency: 'USD' }));
  });

  it('blocks creating a wallet with a balance', async () => {
    await expectDenied(
      create(customer(), `wallets/${CUSTOMER}`, { balance: 1_000_000, currency: 'USD' })
    );
  });

  it('blocks topping up an existing wallet', async () => {
    await seed(`wallets/${CUSTOMER}`, { balance: 5, currency: 'USD' });

    await expectDenied(update(customer(), `wallets/${CUSTOMER}`, { balance: 1_000_000 }));
  });

  it('blocks reading another wallet', async () => {
    await seed(`wallets/${OTHER_CUSTOMER}`, { balance: 5, currency: 'USD' });

    await expectDenied(read(customer(), `wallets/${OTHER_CUSTOMER}`));
  });

  it('lets an admin read a wallet', async () => {
    await seed(`wallets/${CUSTOMER}`, { balance: 5, currency: 'USD' });

    await expectAllowed(read({ uid: ADMIN }, `wallets/${CUSTOMER}`));
  });
});

/* -------------------------------------------------------------------------- */
/* walletTransactions                                                          */
/* -------------------------------------------------------------------------- */

describe('walletTransactions', () => {
  it('blocks forging a deposit', async () => {
    await expectDenied(
      create(customer(), 'walletTransactions/tx-forged', {
        userId: CUSTOMER,
        type: 'deposit',
        amount: 9999,
      })
    );
  });

  it('lets the owner read their own transactions only', async () => {
    await seed('walletTransactions/tx-own', { userId: CUSTOMER, amount: 10 });
    await seed('walletTransactions/tx-other', { userId: OTHER_CUSTOMER, amount: 10 });

    await expectAllowed(read(customer(), 'walletTransactions/tx-own'));
    await expectDenied(read(customer(), 'walletTransactions/tx-other'));
  });
});

/* -------------------------------------------------------------------------- */
/* quotes + PayPal orders                                                      */
/* -------------------------------------------------------------------------- */

describe('quotes', () => {
  it('blocks a customer creating a quote', async () => {
    await expectDenied(create(customer(), 'quotes/quote-1', { userId: CUSTOMER, amount: 1 }));
  });

  it('blocks a customer editing a quote price', async () => {
    await seed('quotes/quote-1', { userId: CUSTOMER, amount: 500 });

    await expectDenied(update(customer(), 'quotes/quote-1', { amount: 1 }));
  });

  it('lets the owner read their quote but not someone else', async () => {
    await seed('quotes/quote-own', { userId: CUSTOMER, amount: 500 });
    await seed('quotes/quote-other', { userId: OTHER_CUSTOMER, amount: 500 });

    await expectAllowed(read(customer(), 'quotes/quote-own'));
    await expectDenied(read(customer(), 'quotes/quote-other'));
  });
});

describe('paypalPaymentOrders', () => {
  it('blocks a customer creating a payment order', async () => {
    await expectDenied(
      create(customer(), 'paypalPaymentOrders/order-1', { userId: CUSTOMER, amount: 1 })
    );
  });

  it('lets the owner read their own order only', async () => {
    await seed('paypalPaymentOrders/order-own', { userId: CUSTOMER, amount: 500 });
    await seed('paypalPaymentOrders/order-other', { userId: OTHER_CUSTOMER, amount: 500 });

    await expectAllowed(read(customer(), 'paypalPaymentOrders/order-own'));
    await expectDenied(read(customer(), 'paypalPaymentOrders/order-other'));
  });
});

/* -------------------------------------------------------------------------- */
/* refunds + support                                                           */
/* -------------------------------------------------------------------------- */

describe('refundRequests', () => {
  it('lets a customer open a refund request for themselves', async () => {
    await expectAllowed(
      create(customer(), 'refundRequests/refund-1', { userId: CUSTOMER, reason: 'damaged' })
    );
  });

  it('blocks a customer approving their own refund', async () => {
    await seed('refundRequests/refund-1', { userId: CUSTOMER, status: 'pending' });

    await expectDenied(update(customer(), 'refundRequests/refund-1', { status: 'approved' }));
  });

  it('blocks reading another customer refund request', async () => {
    await seed('refundRequests/refund-1', { userId: OTHER_CUSTOMER, status: 'pending' });

    await expectDenied(read(customer(), 'refundRequests/refund-1'));
  });
});

describe('support', () => {
  it('lets a customer open a ticket in their own name', async () => {
    await expectAllowed(
      create(customer(), 'supportTickets/ticket-1', { customerId: CUSTOMER, title: 'Help' })
    );
  });

  it('blocks opening a ticket in someone else name', async () => {
    await expectDenied(
      create(customer(), 'supportTickets/ticket-2', { customerId: OTHER_CUSTOMER, title: 'Help' })
    );
  });
});
