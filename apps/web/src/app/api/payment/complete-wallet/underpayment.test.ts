/**
 * Regression test for the wallet underpayment finding, through the HTTP entry
 * point that was named in it: `POST /api/payment/complete-wallet`.
 *
 * `route.test.ts` mocks the wallet service, so it can only check delegation.
 * This suite runs the real service against an in-memory Firestore, which is
 * what proves the property the finding was about: the endpoint takes only the
 * request id and charges the due amount computed from the stored quote inside
 * the transaction, so a $1 cannot buy a $500 request.
 *
 * The ownership block at the end pins the same property for authorization:
 * another customer's request answers exactly like a missing one.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const h = vi.hoisted(() => {
  const store = new Map<string, Record<string, unknown>>();
  let autoId = 0;

  const makeRef = (path: string) => ({
    id: path.split("/")[1],
    path,
    get: async () => {
      const data = store.get(path);
      return { exists: data !== undefined, data: () => data };
    },
    set: async (d: Record<string, unknown>) => {
      store.set(path, d);
    },
    update: async (d: Record<string, unknown>) => {
      store.set(path, { ...(store.get(path) ?? {}), ...d });
    },
  });

  const adminDb = {
    collection: (name: string) => ({
      doc: (id?: string) => makeRef(`${name}/${id ?? `auto-${++autoId}`}`),
    }),
    runTransaction: async (
      fn: (tx: {
        get: (ref: { get(): Promise<unknown> }) => Promise<unknown>;
        update: (
          ref: { update(d: Record<string, unknown>): Promise<void> },
          d: Record<string, unknown>
        ) => Promise<void>;
        set: (
          ref: { set(d: Record<string, unknown>): Promise<void> },
          d: Record<string, unknown>
        ) => Promise<void>;
      }) => Promise<unknown>
    ) =>
      fn({
        get: (ref) => ref.get(),
        update: (ref, d) => ref.update(d),
        set: (ref, d) => ref.set(d),
      }),
  };

  return {
    store,
    adminDb,
    requireAuth: vi.fn(),
    readKey: vi.fn(),
    readPrior: vi.fn(),
    remember: vi.fn(),
  };
});

vi.mock("@/lib/auth", () => ({ requireAuthWithProfile: h.requireAuth }));
vi.mock("@/lib/idempotency", () => ({
  readIdempotencyKey: h.readKey,
  readIdempotentResponse: h.readPrior,
  rememberIdempotentResponse: h.remember,
}));
vi.mock("@/lib/firebaseAdmin", () => ({ adminDb: h.adminDb }));

/**
 * Imported per test, after `vi.resetModules()`: the suite runs with
 * `isolate: false`, so another file's mock can already be bound to the wallet
 * service's module graph. A reset plus a dynamic import gives this file its own.
 */
let POST: typeof import("./route").POST;

const USER_ID = "user-1";
const REQUEST_ID = "req-500";

/** A pending request whose quote prices the payment at $523.33. */
const requestDoc = () => ({
  userId: USER_ID,
  status: "pending",
  quote: { breakdown: { grandTotal: 500 } },
});

const makeRequest = (body: unknown) =>
  ({
    json: async () => body,
    headers: new Headers(),
  }) as unknown as NextRequest;

beforeEach(async () => {
  vi.resetModules();
  h.store.clear();
  h.requireAuth.mockReset().mockResolvedValue({
    token: { uid: USER_ID },
    profile: { uid: USER_ID, role: "customer" },
  });
  h.readKey.mockReset().mockReturnValue(null);
  h.readPrior.mockReset().mockResolvedValue(null);
  h.remember.mockReset().mockResolvedValue(undefined);
  ({ POST } = await import("./route"));
});

describe("POST /api/payment/complete-wallet — underpayment", () => {
  it("ignores a $1 amount in the body and charges the quoted due", async () => {
    // The finding: the client chose the amount, so this call debited $1 and set
    // the request to "paid". The field is gone from the API; a caller that still
    // sends it is charged the quote, not the number it wrote.
    h.store.set(`requests/${REQUEST_ID}`, requestDoc());
    h.store.set(`wallets/${USER_ID}`, { userId: USER_ID, balance: 1000 });

    const res = await POST(makeRequest({ requestId: REQUEST_ID, amount: 1 }));

    expect(res.status).toBe(200);
    expect(h.store.get(`wallets/${USER_ID}`)?.balance).toBeCloseTo(476.67, 2);
    expect(h.store.get(`requests/${REQUEST_ID}`)?.status).toBe("paid");
  });

  it("charges the due amount computed from the quote, not the body's number", async () => {
    // (500 + 0.30) / (1 - 0.044) = 523.3263…, rounded up to the cent.
    h.store.set(`requests/${REQUEST_ID}`, requestDoc());
    h.store.set(`wallets/${USER_ID}`, { userId: USER_ID, balance: 1000 });

    const res = await POST(makeRequest({ requestId: REQUEST_ID }));

    expect(res.status).toBe(200);
    expect(h.store.get(`wallets/${USER_ID}`)?.balance).toBeCloseTo(476.67, 2);

    const updated = h.store.get(`requests/${REQUEST_ID}`) as {
      status?: string;
      payment?: { amountPaid?: number };
    };
    expect(updated.status).toBe("paid");
    expect(updated.payment?.amountPaid).toBe(523.33);

    const ledger = [...h.store.entries()].find(([key]) =>
      key.startsWith("walletTransactions/")
    );
    expect(ledger?.[1]).toMatchObject({
      amount: -523.33,
      requestId: REQUEST_ID,
    });
  });

  it("refuses a request whose quote carries no payable total", async () => {
    h.store.set(`requests/${REQUEST_ID}`, {
      userId: USER_ID,
      status: "pending",
    });
    h.store.set(`wallets/${USER_ID}`, { userId: USER_ID, balance: 1000 });

    const res = await POST(makeRequest({ requestId: REQUEST_ID }));

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      code: "QUOTE_AMOUNT_MISSING",
    });
    expect(h.store.get(`wallets/${USER_ID}`)?.balance).toBe(1000);
  });
});

describe("POST /api/payment/complete-wallet — ownership", () => {
  it("answers another customer's request exactly like a missing one", async () => {
    // The oracle: a 403 "You are not authorized to access this request." told a
    // caller that the id existed. Both refusals must now be one response.
    h.store.set(`requests/${REQUEST_ID}`, {
      ...requestDoc(),
      userId: "someone-else",
    });
    h.store.set(`wallets/${USER_ID}`, { userId: USER_ID, balance: 1000 });

    const stranger = await POST(makeRequest({ requestId: REQUEST_ID }));
    const missing = await POST(
      makeRequest({ requestId: "req-does-not-exist" })
    );

    expect(stranger.status).toBe(404);
    expect(missing.status).toBe(404);

    const strangerBody = await stranger.json();

    await expect(missing.json()).resolves.toEqual(strangerBody);
    expect(strangerBody).toEqual({
      success: false,
      error: "Request not found.",
      code: "REQUEST_NOT_FOUND",
    });

    // Nothing moved for the other customer's request, and nothing left the
    // caller's wallet.
    expect(h.store.get(`wallets/${USER_ID}`)?.balance).toBe(1000);
    expect(h.store.get(`requests/${REQUEST_ID}`)?.status).toBe("pending");
    expect(
      [...h.store.keys()].filter((key) => key.startsWith("walletTransactions/"))
    ).toEqual([]);
  });
});
