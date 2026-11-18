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
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const PROJECT = "shipin-rules";
const HOST = `http://127.0.0.1:${process.env.FIRESTORE_EMULATOR_PORT ?? 8080}`;
const DOCS = `${HOST}/v1/projects/${PROJECT}/databases/(default)/documents`;
const CLEAR = `${HOST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`;

const CUSTOMER = "customer-1";
const OTHER_CUSTOMER = "customer-2";
const NEW_CUSTOMER = "customer-3";
const ADMIN = "admin-1";
/**
 * A uid whose ID token still carries the admin custom claim after being
 * demoted. The rules must ignore it: `users/{uid}.role` is the only source of
 * truth for admin access.
 */
const STALE_CLAIM_CUSTOMER = "customer-stale";
/** A promoted admin whose token carries no custom claim at all. */
const ROLE_ONLY_ADMIN = "admin-role-only";

/* -------------------------------------------------------------------------- */
/* Emulator plumbing                                                          */
/* -------------------------------------------------------------------------- */

function base64url(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

/**
 * Unsigned ID token for the emulator. It does not verify signatures; it reads
 * `sub`/`user_id` and exposes them as `request.auth.uid`.
 */
function tokenFor(uid: string): string {
  const now = Math.floor(Date.now() / 1000);
  const isAdmin = uid === ADMIN || uid === STALE_CLAIM_CUSTOMER;
  return [
    base64url({ alg: "none", typ: "JWT" }),
    base64url({
      iss: `https://securetoken.google.com/${PROJECT}`,
      aud: PROJECT,
      auth_time: now,
      user_id: uid,
      sub: uid,
      iat: now,
      exp: now + 3600,
      firebase: { identities: {}, sign_in_provider: "custom" },
      // Custom claims the rules read: `isAdmin()` checks `token.admin`. This
      // belongs in the payload — the emulator rejected a token whose claim sat
      // in the signature slot (400 "invalid jwt").
      ...(isAdmin ? { admin: true } : {}),
    }),
    // `alg: none` carries an empty signature and nothing else. The token must be
    // exactly three segments; a fourth made the emulator reject it.
    "",
  ].join(".");
}

/**
 * Stands in for `serverTimestamp()`.
 *
 * The rules compare `createdAt == request.time`, which only holds for a real
 * REQUEST_TIME transform — a literal timestamp can never satisfy it, and that
 * is the point (it blocks backdating). REST writes carry transforms in
 * `updateTransforms`, so the value itself is encoded as null and listed there.
 */
const SERVER_TIMESTAMP = Symbol("serverTimestamp");

function transformPaths(doc: Record<string, unknown>): string[] {
  return Object.entries(doc)
    .filter(([, value]) => value === SERVER_TIMESTAMP)
    .map(([key]) => key);
}

/** Encode a JS value in the Firestore REST field format. */
function encodeValue(value: unknown): Record<string, unknown> {
  if (value === SERVER_TIMESTAMP) return { nullValue: null };
  if (value === null) return { nullValue: null };
  if (typeof value === "string") return { stringValue: value };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number") {
    return Number.isInteger(value)
      ? { integerValue: String(value) }
      : { doubleValue: value };
  }
  if (Array.isArray(value))
    return { arrayValue: { values: value.map(encodeValue) } };
  if (typeof value === "object") {
    return {
      mapValue: { fields: encodeFields(value as Record<string, unknown>) },
    };
  }
  throw new Error(`Cannot encode ${typeof value} for Firestore`);
}

function encodeFields(doc: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(doc).map(([key, value]) => [key, encodeValue(value)])
  );
}

/**
 * One write, as the REST `:commit` endpoint expects it.
 *
 * `serverTimestamp()` cannot be expressed on a plain document PATCH — the
 * transform only exists in a Write, which the emulator rejects as an invalid
 * payload outside `:commit`.
 */
function writeFor(
  path: string,
  data: Record<string, unknown>,
  exists: boolean
): Record<string, unknown> {
  const transforms = transformPaths(data).map((fieldPath) => ({
    fieldPath,
    setToServerValue: "REQUEST_TIME",
  }));

  return {
    update: {
      name: `projects/${PROJECT}/databases/(default)/documents/${path}`,
      fields: encodeFields(data),
    },
    updateMask: { fieldPaths: Object.keys(data) },
    ...(transforms.length > 0 ? { updateTransforms: transforms } : {}),
    currentDocument: { exists },
  };
}

function commit(
  actor: Actor,
  writes: Array<Record<string, unknown>>
): Promise<Response> {
  return fetch(`${DOCS}:commit`, {
    method: "POST",
    headers: headersFor(actor, true),
    body: JSON.stringify({ writes }),
  });
}

type Actor = { uid: string } | "owner" | "anonymous";

function headersFor(actor: Actor, withBody = false): Record<string, string> {
  const headers: Record<string, string> = {};
  if (withBody) headers["content-type"] = "application/json";
  if (actor === "owner") headers.authorization = "Bearer owner";
  else if (actor !== "anonymous")
    headers.authorization = `Bearer ${tokenFor(actor.uid)}`;
  return headers;
}

/** Create a document; fails with 403 when the rules forbid creation. */
function create(
  actor: Actor,
  path: string,
  data: Record<string, unknown>
): Promise<Response> {
  return commit(actor, [writeFor(path, data, false)]);
}

/** Update an existing document; fails with 403 when the rules forbid it. */
function update(
  actor: Actor,
  path: string,
  data: Record<string, unknown>
): Promise<Response> {
  return commit(actor, [writeFor(path, data, true)]);
}

function read(actor: Actor, path: string): Promise<Response> {
  return fetch(`${DOCS}/${path}`, { headers: headersFor(actor) });
}

/** Write a fixture the way trusted server code would, bypassing the rules. */
async function seed(
  path: string,
  data: Record<string, unknown>
): Promise<void> {
  const response = await fetch(`${DOCS}/${path}`, {
    method: "PATCH",
    headers: headersFor("owner", true),
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
  const cleared = await fetch(CLEAR, { method: "DELETE" });
  expect(cleared.status).toBe(200);

  // `isAdmin()` resolves the caller's role from this document.
  await seed(`users/${ADMIN}`, { role: "admin" });
  await seed(`users/${CUSTOMER}`, {
    role: "customer",
    displayName: "Customer",
  });
});

afterAll(async () => {
  // Nothing to tear down: `emulators:exec` owns the process.
});

const customer = (): Actor => ({ uid: CUSTOMER });
const anonymous: Actor = "anonymous";

/* -------------------------------------------------------------------------- */
/* Anonymous access                                                            */
/* -------------------------------------------------------------------------- */

describe("anonymous access", () => {
  it("cannot read a wallet", async () => {
    await seed(`wallets/${CUSTOMER}`, { balance: 10, currency: "USD" });

    await expectDenied(read(anonymous, `wallets/${CUSTOMER}`));
  });

  it("cannot read a request", async () => {
    await seed(`requests/req-1`, { userId: CUSTOMER, status: "review" });

    await expectDenied(read(anonymous, "requests/req-1"));
  });

  it("cannot create a request", async () => {
    await expectDenied(
      create(anonymous, "requests/req-anon", {
        userId: CUSTOMER,
        status: "submitted",
      })
    );
  });
});

/* -------------------------------------------------------------------------- */
/* users                                                                       */
/* -------------------------------------------------------------------------- */

describe("users", () => {
  it("lets a customer read their own profile", async () => {
    await expectAllowed(read(customer(), `users/${CUSTOMER}`));
  });

  it("blocks reading another customer profile", async () => {
    await expectDenied(read(customer(), `users/${OTHER_CUSTOMER}`));
  });

  it("lets a customer edit cosmetic profile fields", async () => {
    await expectAllowed(
      update(customer(), `users/${CUSTOMER}`, { displayName: "Renamed" })
    );
  });

  it("blocks self-promotion to admin", async () => {
    await expectDenied(
      update(customer(), `users/${CUSTOMER}`, { role: "admin" })
    );
  });

  it("blocks writing MFA state from the client", async () => {
    await expectDenied(
      update(customer(), `users/${CUSTOMER}`, {
        mfa: { totp: { enabled: true, secret: "attacker-chosen" } },
      })
    );
  });

  it("blocks rewriting an account-state field", async () => {
    await expectDenied(
      update(customer(), `users/${CUSTOMER}`, { disabled: false })
    );
  });

  it("blocks creating a profile that claims admin", async () => {
    await expectDenied(
      create({ uid: NEW_CUSTOMER }, `users/${NEW_CUSTOMER}`, {
        displayName: "New",
        role: "admin",
      })
    );
  });

  it("allows creating an ordinary customer profile", async () => {
    await expectAllowed(
      create({ uid: NEW_CUSTOMER }, `users/${NEW_CUSTOMER}`, {
        displayName: "New",
        role: "customer",
      })
    );
  });
});

/* -------------------------------------------------------------------------- */
/* requests                                                                    */
/* -------------------------------------------------------------------------- */

describe("requests", () => {
  it("lets a customer file their own unpriced request", async () => {
    await expectAllowed(
      create(customer(), "requests/req-new", {
        userId: CUSTOMER,
        status: "submitted",
        items: [],
        customerName: "Customer",
      })
    );
  });

  it("blocks filing a request in someone else name", async () => {
    await expectDenied(
      create(customer(), "requests/req-new", {
        userId: OTHER_CUSTOMER,
        status: "submitted",
      })
    );
  });

  it("blocks filing a request that is already paid", async () => {
    await expectDenied(
      create(customer(), "requests/req-new", {
        userId: CUSTOMER,
        status: "paid",
        items: [],
      })
    );
  });

  it("blocks filing a request with pricing attached", async () => {
    await expectDenied(
      create(customer(), "requests/req-new", {
        userId: CUSTOMER,
        status: "submitted",
        quote: { breakdown: { grandTotal: 1 } },
      })
    );
  });

  it("lets the owner read their own request", async () => {
    await seed("requests/req-1", {
      userId: CUSTOMER,
      status: "awaiting_payment",
    });

    await expectAllowed(read(customer(), "requests/req-1"));
  });

  it("blocks reading another customer request", async () => {
    await seed("requests/req-1", {
      userId: OTHER_CUSTOMER,
      status: "awaiting_payment",
    });

    await expectDenied(read(customer(), "requests/req-1"));
  });

  it("blocks the owner marking their own request paid", async () => {
    await seed("requests/req-1", {
      userId: CUSTOMER,
      status: "awaiting_payment",
      quote: { breakdown: { grandTotal: 500 } },
    });

    await expectDenied(
      update(customer(), "requests/req-1", { status: "paid" })
    );
  });

  it("blocks the owner rewriting the quoted total", async () => {
    await seed("requests/req-1", {
      userId: CUSTOMER,
      status: "awaiting_payment",
      quote: { breakdown: { grandTotal: 500 } },
    });

    await expectDenied(
      update(customer(), "requests/req-1", {
        quote: { breakdown: { grandTotal: 1 } },
      })
    );
  });

  it("blocks handing a request to another account", async () => {
    await seed("requests/req-1", { userId: CUSTOMER, status: "review" });

    await expectDenied(
      update(customer(), "requests/req-1", { userId: OTHER_CUSTOMER })
    );
  });

  it("lets an admin read and advance any request", async () => {
    await seed("requests/req-1", { userId: CUSTOMER, status: "paid" });

    await expectAllowed(read({ uid: ADMIN }, "requests/req-1"));
    await expectAllowed(
      update({ uid: ADMIN }, "requests/req-1", { status: "purchased" })
    );
  });
});

/* -------------------------------------------------------------------------- */
/* wallets                                                                     */
/* -------------------------------------------------------------------------- */

/* -------------------------------------------------------------------------- */
/* admin identity                                                              */
/* -------------------------------------------------------------------------- */

describe("admin identity", () => {
  it("is decided by users/{uid}.role, with no custom claim on the token", async () => {
    await seed(`users/${ROLE_ONLY_ADMIN}`, { role: "admin" });
    await seed("requests/req-role", { userId: CUSTOMER, status: "review" });

    await expectAllowed(
      update({ uid: ROLE_ONLY_ADMIN }, "requests/req-role", {
        status: "quoted",
      })
    );
  });

  it("revokes admin access the moment the role is demoted", async () => {
    await seed(`users/${STALE_CLAIM_CUSTOMER}`, { role: "customer" });
    await seed("requests/req-demoted", { userId: CUSTOMER, status: "review" });

    // The token still carries `admin: true`; the profile says customer.
    await expectDenied(
      update({ uid: STALE_CLAIM_CUSTOMER }, "requests/req-demoted", {
        status: "quoted",
      })
    );
  });

  it("does not fall back to the claim when the profile is missing", async () => {
    await seed("requests/req-no-profile", {
      userId: CUSTOMER,
      status: "review",
    });

    await expectDenied(
      update({ uid: STALE_CLAIM_CUSTOMER }, "requests/req-no-profile", {
        status: "quoted",
      })
    );
  });
});

/* -------------------------------------------------------------------------- */
/* shipments                                                                   */
/* -------------------------------------------------------------------------- */

describe("shipments", () => {
  it("lets a customer read the shipment they own", async () => {
    await seed("shipments/ship-1", {
      userId: CUSTOMER,
      requestIds: [],
      status: "building",
    });

    await expectAllowed(read(customer(), "shipments/ship-1"));
  });

  it("blocks reading another customer shipment", async () => {
    await seed("shipments/ship-2", {
      userId: OTHER_CUSTOMER,
      requestIds: [],
      status: "building",
    });

    await expectDenied(read(customer(), "shipments/ship-2"));
  });

  it("blocks anonymous reads", async () => {
    await seed("shipments/ship-3", {
      userId: CUSTOMER,
      requestIds: [],
      status: "building",
    });

    await expectDenied(read(anonymous, "shipments/ship-3"));
  });

  it("lets an admin read any shipment", async () => {
    await seed("shipments/ship-4", {
      userId: CUSTOMER,
      requestIds: [],
      status: "building",
    });

    await expectAllowed(read({ uid: ADMIN }, "shipments/ship-4"));
  });

  it("blocks every customer write", async () => {
    await expectDenied(
      create(customer(), "shipments/ship-new", {
        userId: CUSTOMER,
        requestIds: [],
        status: "building",
      })
    );

    await seed("shipments/ship-5", {
      userId: CUSTOMER,
      requestIds: [],
      status: "building",
    });
    await expectDenied(
      update(customer(), "shipments/ship-5", { status: "shipped" })
    );
  });

  it("lets an admin update a shipment", async () => {
    await seed("shipments/ship-6", {
      userId: CUSTOMER,
      requestIds: [],
      status: "building",
    });

    await expectAllowed(
      update({ uid: ADMIN }, "shipments/ship-6", { status: "ready" })
    );
  });
});

/* -------------------------------------------------------------------------- */
/* counters                                                                        */
/* -------------------------------------------------------------------------- */

describe("counters", () => {
  it("blocks a customer creating a counter from the browser", async () => {
    await expectDenied(create(customer(), "counters/tracking", { value: 1 }));
  });

  it("blocks a customer reading another customer counter", async () => {
    await seed("counters/tracking", { value: 5 });

    await expectDenied(read(customer(), "counters/tracking"));
  });

  it("lets an admin read a counter", async () => {
    await seed("counters/tracking", { value: 5 });

    await expectAllowed(read({ uid: ADMIN }, "counters/tracking"));
  });

  it("blocks anonymous reads of counters", async () => {
    await expectDenied(read(anonymous, "counters/tracking"));
  });
});

describe("wallets", () => {
  it("allows the owner to self-provision an empty wallet", async () => {
    await expectAllowed(
      create(customer(), `wallets/${CUSTOMER}`, { balance: 0, currency: "USD" })
    );
  });

  it("blocks creating a wallet with a balance", async () => {
    await expectDenied(
      create(customer(), `wallets/${CUSTOMER}`, {
        balance: 1_000_000,
        currency: "USD",
      })
    );
  });

  it("blocks topping up an existing wallet", async () => {
    await seed(`wallets/${CUSTOMER}`, { balance: 5, currency: "USD" });

    await expectDenied(
      update(customer(), `wallets/${CUSTOMER}`, { balance: 1_000_000 })
    );
  });

  it("blocks reading another wallet", async () => {
    await seed(`wallets/${OTHER_CUSTOMER}`, { balance: 5, currency: "USD" });

    await expectDenied(read(customer(), `wallets/${OTHER_CUSTOMER}`));
  });

  it("lets an admin read a wallet", async () => {
    await seed(`wallets/${CUSTOMER}`, { balance: 5, currency: "USD" });

    await expectAllowed(read({ uid: ADMIN }, `wallets/${CUSTOMER}`));
  });
});

/* -------------------------------------------------------------------------- */
/* walletTransactions                                                          */
/* -------------------------------------------------------------------------- */

describe("walletTransactions", () => {
  it("blocks forging a deposit", async () => {
    await expectDenied(
      create(customer(), "walletTransactions/tx-forged", {
        userId: CUSTOMER,
        type: "deposit",
        amount: 9999,
      })
    );
  });

  it("lets the owner read their own transactions only", async () => {
    await seed("walletTransactions/tx-own", { userId: CUSTOMER, amount: 10 });
    await seed("walletTransactions/tx-other", {
      userId: OTHER_CUSTOMER,
      amount: 10,
    });

    await expectAllowed(read(customer(), "walletTransactions/tx-own"));
    await expectDenied(read(customer(), "walletTransactions/tx-other"));
  });
});

/* -------------------------------------------------------------------------- */
/* quotes + PayPal orders                                                      */
/* -------------------------------------------------------------------------- */

describe("quotes", () => {
  it("blocks a customer creating a quote", async () => {
    await expectDenied(
      create(customer(), "quotes/quote-1", { userId: CUSTOMER, amount: 1 })
    );
  });

  it("blocks a customer editing a quote price", async () => {
    await seed("quotes/quote-1", { userId: CUSTOMER, amount: 500 });

    await expectDenied(update(customer(), "quotes/quote-1", { amount: 1 }));
  });

  it("lets the owner read their quote but not someone else", async () => {
    await seed("quotes/quote-own", { userId: CUSTOMER, amount: 500 });
    await seed("quotes/quote-other", { userId: OTHER_CUSTOMER, amount: 500 });

    await expectAllowed(read(customer(), "quotes/quote-own"));
    await expectDenied(read(customer(), "quotes/quote-other"));
  });
});

describe("paypalPaymentOrders", () => {
  it("blocks a customer creating a payment order", async () => {
    await expectDenied(
      create(customer(), "paypalPaymentOrders/order-1", {
        userId: CUSTOMER,
        amount: 1,
      })
    );
  });

  it("lets the owner read their own order only", async () => {
    await seed("paypalPaymentOrders/order-own", {
      userId: CUSTOMER,
      amount: 500,
    });
    await seed("paypalPaymentOrders/order-other", {
      userId: OTHER_CUSTOMER,
      amount: 500,
    });

    await expectAllowed(read(customer(), "paypalPaymentOrders/order-own"));
    await expectDenied(read(customer(), "paypalPaymentOrders/order-other"));
  });
});

/* -------------------------------------------------------------------------- */
/* refunds + support                                                           */
/* -------------------------------------------------------------------------- */

describe("refundRequests", () => {
  /*
   * The collection has no rule block: nothing in the app reads or writes it
   * (refunds go through /api/admin/requests/[requestId]/refund* with the Admin
   * SDK). The old block let a customer create a document with their own userId
   * and an unconstrained status/amount, so "default deny" is the fix.
   */
  it("blocks a customer creating a refund request from the browser", async () => {
    await expectDenied(
      create(customer(), "refundRequests/refund-1", {
        userId: CUSTOMER,
        reason: "damaged",
      })
    );
  });

  it("blocks a customer approving their own refund", async () => {
    await seed("refundRequests/refund-1", {
      userId: CUSTOMER,
      status: "pending",
    });

    await expectDenied(
      update(customer(), "refundRequests/refund-1", { status: "approved" })
    );
  });

  it("blocks reading another customer refund request", async () => {
    await seed("refundRequests/refund-1", {
      userId: OTHER_CUSTOMER,
      status: "pending",
    });

    await expectDenied(read(customer(), "refundRequests/refund-1"));
  });
});

describe("notifications", () => {
  const notice = (overrides: Record<string, unknown> = {}) => ({
    userId: CUSTOMER,
    requestId: "req-1",
    title: "Payment Received",
    message: "Your payment has been recorded.",
    type: "payment",
    read: false,
    // What `serverTimestamp()` writes; the rule requires request.time.
    createdAt: SERVER_TIMESTAMP,
    ...overrides,
  });

  it("lets a customer read their own notification", async () => {
    await seed("notifications/n-1", notice());

    await expectAllowed(read(customer(), "notifications/n-1"));
  });

  it("blocks reading another customer notification", async () => {
    await seed("notifications/n-2", notice({ userId: OTHER_CUSTOMER }));

    await expectDenied(read(customer(), "notifications/n-2"));
  });

  it("lets a customer create their own unread notification", async () => {
    await expectAllowed(create(customer(), "notifications/n-3", notice()));
  });

  it("blocks creating a notification in someone else name", async () => {
    await expectDenied(
      create(
        customer(),
        "notifications/n-4",
        notice({ userId: OTHER_CUSTOMER })
      )
    );
  });

  it("lets an admin notify a customer", async () => {
    await expectAllowed(
      create(
        { uid: ADMIN },
        "notifications/n-5",
        notice({ userId: OTHER_CUSTOMER })
      )
    );
  });

  it("blocks a create that arrives already read", async () => {
    await expectDenied(
      create(customer(), "notifications/n-6", notice({ read: true }))
    );
  });

  it("blocks a client marking a notification read", async () => {
    await seed("notifications/n-7", notice());

    await expectDenied(update(customer(), "notifications/n-7", { read: true }));
  });
});

describe("support", () => {
  /*
   * The payload is what `createSupportTicket` actually writes: the ticket
   * fields, `status: 'open'` and two server timestamps. The rule rejects a
   * create that is born resolved, backdated or carrying admin-owned fields.
   */
  const newTicket = (overrides: Record<string, unknown> = {}) => ({
    ticketNumber: "T-1",
    requestId: "req-1",
    customerId: CUSTOMER,
    category: "Shipment",
    subject: "Help",
    status: "open",
    createdAt: SERVER_TIMESTAMP,
    updatedAt: SERVER_TIMESTAMP,
    ...overrides,
  });

  it("lets a customer open a ticket in their own name", async () => {
    await expectAllowed(
      create(customer(), "supportTickets/ticket-1", newTicket())
    );
  });

  it("blocks opening a ticket in someone else name", async () => {
    await expectDenied(
      create(
        customer(),
        "supportTickets/ticket-2",
        newTicket({ customerId: OTHER_CUSTOMER })
      )
    );
  });

  it("blocks a ticket created already resolved", async () => {
    await expectDenied(
      create(
        customer(),
        "supportTickets/ticket-7",
        newTicket({ status: "resolved" })
      )
    );
  });

  it("blocks admin-owned fields riding along with the create", async () => {
    await expectDenied(
      create(
        customer(),
        "supportTickets/ticket-8",
        newTicket({ priority: "urgent" })
      )
    );
    await expectDenied(
      create(
        customer(),
        "supportTickets/ticket-9",
        newTicket({ assignedTo: ADMIN })
      )
    );
  });

  it("blocks a backdated createdAt", async () => {
    await expectDenied(
      create(
        customer(),
        "supportTickets/ticket-10",
        newTicket({ createdAt: "2020-01-01T00:00:00.000Z" })
      )
    );
  });

  /*
   * A customer used to be able to update any field of their own ticket, so the
   * support UI's read receipt was also a way to resolve, reprioritise or
   * reassign a ticket from the browser. The rules now allow exactly the two
   * keys `markSupportTicketRead` writes; everything else is admin-only.
   */
  const ticket = (overrides: Record<string, unknown> = {}) => ({
    customerId: CUSTOMER,
    title: "Help",
    status: "open",
    priority: "normal",
    adminUnread: true,
    customerUnread: true,
    updatedAt: 1,
    ...overrides,
  });

  it("lets a customer clear their own unread flag", async () => {
    await seed("supportTickets/ticket-3", ticket());

    await expectAllowed(
      update(customer(), "supportTickets/ticket-3", {
        customerUnread: false,
        updatedAt: 2,
      })
    );
  });

  it("blocks a customer resolving their own ticket", async () => {
    await seed("supportTickets/ticket-4", ticket());

    await expectDenied(
      update(customer(), "supportTickets/ticket-4", {
        status: "resolved",
        updatedAt: 2,
      })
    );
  });

  it("blocks a customer reprioritising or reassigning their ticket", async () => {
    await seed("supportTickets/ticket-5", ticket());

    await expectDenied(
      update(customer(), "supportTickets/ticket-5", { priority: "urgent" })
    );
    await expectDenied(
      update(customer(), "supportTickets/ticket-5", { assignedTo: ADMIN })
    );
  });

  it("blocks a customer touching the admin unread flag", async () => {
    await seed("supportTickets/ticket-6", ticket());

    await expectDenied(
      update(customer(), "supportTickets/ticket-6", { adminUnread: false })
    );
  });

  it("blocks a customer re-marking their ticket unread", async () => {
    await seed("supportTickets/ticket-7", ticket({ customerUnread: false }));

    await expectDenied(
      update(customer(), "supportTickets/ticket-7", {
        customerUnread: true,
        updatedAt: 2,
      })
    );
  });

  it("blocks a third party from updating the ticket", async () => {
    await seed("supportTickets/ticket-8", ticket());

    await expectDenied(
      update({ uid: OTHER_CUSTOMER }, "supportTickets/ticket-8", {
        customerUnread: false,
        updatedAt: 2,
      })
    );
  });

  it("still lets an admin resolve a ticket", async () => {
    await seed("supportTickets/ticket-9", ticket());

    await expectAllowed(
      update({ uid: ADMIN }, "supportTickets/ticket-9", {
        status: "resolved",
        resolvedAt: 2,
        updatedAt: 2,
      })
    );
  });

  /*
   * Messages carry no customerId (see the create rule above), so a read is
   * authorised through the parent ticket. A read rule that reaches into
   * `request.resource` instead of `resource` looks plausible and denies every
   * customer, because a read has no proposed document — which is what the
   * support thread silently turning up empty was.
   */
  const message = (overrides: Record<string, unknown> = {}) => ({
    ticketId: "ticket-11",
    sender: "customer",
    message: "Where is my parcel?",
    createdAt: 1,
    ...overrides,
  });

  it("lets a customer read the thread on their own ticket", async () => {
    await seed("supportTickets/ticket-11", ticket());
    await seed("supportMessages/message-1", message());

    await expectAllowed(read(customer(), "supportMessages/message-1"));
  });

  it("blocks reading another customer's thread", async () => {
    await seed("supportTickets/ticket-11", ticket());
    await seed("supportMessages/message-2", message());

    await expectDenied(
      read({ uid: OTHER_CUSTOMER }, "supportMessages/message-2")
    );
  });

  it("lets an admin read any thread", async () => {
    await seed("supportTickets/ticket-11", ticket());
    await seed("supportMessages/message-3", message({ sender: "admin" }));

    await expectAllowed(read({ uid: ADMIN }, "supportMessages/message-3"));
  });

  it("blocks an anonymous read of a thread", async () => {
    await seed("supportTickets/ticket-11", ticket());
    await seed("supportMessages/message-4", message());

    await expectDenied(read(anonymous, "supportMessages/message-4"));
  });
});
