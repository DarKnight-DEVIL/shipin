/**
 * Integration tests for processWalletPayment.
 *
 * Uses the in-memory Firestore mock so no real database is accessed.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// These suites rebuild their module graph per test (they reset modules so each
// case gets a fresh instance). That is cheap normally but can exceed the
// default 5s ceiling when the whole suite runs unisolated on a loaded machine,
// which surfaced as spurious timeouts. The assertions are unchanged.
vi.setConfig({ testTimeout: 15_000 });

type MockDocHandle = {
  get(): Promise<unknown>;
  update(data: Record<string, unknown>): Promise<void>;
  set(data: Record<string, unknown>): Promise<void>;
};

describe("processWalletPayment", () => {
  let fakeStore: Map<string, Record<string, unknown>>;
  let fakeAdminDb: {
    collection: ReturnType<typeof vi.fn>;
    runTransaction: ReturnType<typeof vi.fn>;
  };

  const USER_ID = "user-1";
  const REQUEST_ID = "test-req-1";
  /**
   * The endpoint no longer takes an amount: the service prices the payment from
   * the stored quote. `(50 + 0.30) / (1 - 0.044) = 52.6150…`, charged at 52.62.
   */
  const GRAND_TOTAL = 50;
  const DUE = 52.62;
  const QUOTED_REQUEST = {
    userId: USER_ID,
    status: "pending",
    quote: { breakdown: { grandTotal: GRAND_TOTAL } },
  };

  function makeDocRef(path: string) {
    return {
      id: path.split("/")[1],
      path,
      get: async () => {
        const data = fakeStore.get(path);
        return { exists: data !== undefined, data: () => data };
      },
      set: async (d: Record<string, unknown>) => {
        fakeStore.set(path, d);
      },
      update: async (d: Record<string, unknown>) => {
        const cur = fakeStore.get(path) ?? {};
        fakeStore.set(path, { ...cur, ...d });
      },
      delete: async () => fakeStore.delete(path),
    };
  }

  function setupDb() {
    fakeStore = new Map();
    fakeAdminDb = {
      collection: vi.fn((colName: string) => ({
        doc: vi.fn((docId: string) => makeDocRef(`${colName}/${docId}`)),
      })),
      runTransaction: vi.fn(
        async (fn: (tx: Record<string, unknown>) => Promise<unknown>) =>
          fn({
            get: async (ref: MockDocHandle) => ref.get(),
            update: async (ref: MockDocHandle, data: Record<string, unknown>) =>
              ref.update(data),
            set: async (ref: MockDocHandle, data: Record<string, unknown>) =>
              ref.set(data),
          })
      ),
    };
  }

  beforeEach(() => {
    vi.resetModules();
    setupDb();
    vi.doMock("@/lib/firebaseAdmin", () => ({ adminDb: fakeAdminDb }));
  });

  afterEach(() => {
    vi.doUnmock("@/lib/firebaseAdmin");
  });

  async function withFreshService(
    requestData: Record<string, unknown>,
    walletData: Record<string, unknown>
  ) {
    fakeStore.set(`requests/${REQUEST_ID}`, requestData);
    fakeStore.set(`wallets/${USER_ID}`, walletData);
    const { processWalletPayment: freshProcess } =
      await import("./walletPayment");
    return freshProcess;
  }

  it("deducts balance and marks request paid on success", async () => {
    const walData = { userId: USER_ID, balance: 200, currency: "USD" };
    const fn = await withFreshService(QUOTED_REQUEST, walData);

    const result = await fn(REQUEST_ID, USER_ID);

    expect(result).toMatchObject({
      success: true,
      transactionId: expect.any(String),
    });
    expect(fakeStore.get(`wallets/${USER_ID}`)?.balance).toBeCloseTo(
      200 - DUE,
      2
    );

    const updatedRequest = fakeStore.get(`requests/${REQUEST_ID}`) as
      { status?: string; payment?: { amountPaid?: number } } | undefined;
    expect(updatedRequest?.status).toBe("paid");
    expect(updatedRequest?.payment?.amountPaid).toBe(DUE);
  });

  it("prices the payment from the quote, not from anything the caller sends", async () => {
    const fn = await withFreshService(
      { ...QUOTED_REQUEST, quote: { breakdown: { grandTotal: 500 } } },
      { userId: USER_ID, balance: 1000 }
    );

    await fn(REQUEST_ID, USER_ID);

    // (500 + 0.30) / (1 - 0.044) = 523.3263… → 523.33
    const updated = fakeStore.get(`requests/${REQUEST_ID}`) as {
      payment?: { amountPaid?: number };
    };
    expect(updated.payment?.amountPaid).toBe(523.33);
  });

  it("refuses a request whose quote carries no payable total", async () => {
    const fn = await withFreshService(
      { userId: USER_ID, status: "pending" },
      { balance: 200 }
    );

    await expect(fn(REQUEST_ID, USER_ID)).rejects.toThrow(
      "QUOTE_AMOUNT_MISSING"
    );
    // Nothing may move: a request that cannot be priced cannot be settled.
    expect(fakeStore.get(`wallets/${USER_ID}`)?.balance).toBe(200);
    expect(fakeStore.get(`requests/${REQUEST_ID}`)?.status).toBe("pending");
  });

  it("refuses a quote whose total is not a payable amount", async () => {
    // A breakdown that exists but prices to zero is not settleable either.
    const fn = await withFreshService(
      { ...QUOTED_REQUEST, quote: { breakdown: { grandTotal: 0 } } },
      { balance: 200 }
    );

    await expect(fn(REQUEST_ID, USER_ID)).rejects.toThrow(
      "QUOTE_AMOUNT_MISSING"
    );
    expect(fakeStore.get(`wallets/${USER_ID}`)?.balance).toBe(200);
  });

  it("rejects when request not found", async () => {
    const fn = await withFreshService({}, { balance: 100 });
    fakeStore.delete(`requests/${REQUEST_ID}`);

    await expect(fn(REQUEST_ID, USER_ID)).rejects.toThrow("REQUEST_NOT_FOUND");
  });

  it("answers another customer's request exactly like a missing one", async () => {
    // A distinct 403 would confirm that the id exists to someone guessing ids.
    const fn = await withFreshService(
      { ...QUOTED_REQUEST, userId: "other-user" },
      { balance: 100 }
    );

    await expect(fn(REQUEST_ID, USER_ID)).rejects.toThrow("REQUEST_NOT_FOUND");
  });

  it("rejects already-paid request (idempotency)", async () => {
    const fn = await withFreshService(
      { ...QUOTED_REQUEST, status: "paid" },
      { balance: 200 }
    );

    await expect(fn(REQUEST_ID, USER_ID)).rejects.toThrow("ALREADY_PAID");
  });

  it("rejects a request that is no longer payable", async () => {
    const fn = await withFreshService(
      { ...QUOTED_REQUEST, status: "refunded" },
      { balance: 200 }
    );

    await expect(fn(REQUEST_ID, USER_ID)).rejects.toThrow(
      "REQUEST_NOT_PAYABLE"
    );
  });

  it("rejects insufficient balance", async () => {
    const fn = await withFreshService(QUOTED_REQUEST, { balance: 30 });

    await expect(fn(REQUEST_ID, USER_ID)).rejects.toThrow(
      "INSUFFICIENT_BALANCE"
    );
  });

  it("treats a wallet document with no balance as zero", async () => {
    const fn = await withFreshService(QUOTED_REQUEST, { reserved: 0 });

    await expect(fn(REQUEST_ID, USER_ID)).rejects.toThrow(
      "INSUFFICIENT_BALANCE"
    );
  });

  it("does not spend funds reserved for a pending PayPal checkout", async () => {
    const fn = await withFreshService(QUOTED_REQUEST, {
      balance: 200,
      reserved: 180,
    });

    // 20 left is less than the 52.62 due, even though the balance says 200.
    await expect(fn(REQUEST_ID, USER_ID)).rejects.toThrow(
      "INSUFFICIENT_BALANCE"
    );
    expect(fakeStore.get(`wallets/${USER_ID}`)?.balance).toBe(200);
  });

  it("rejects when wallet does not exist", async () => {
    const fn = await withFreshService(QUOTED_REQUEST, {});
    fakeStore.delete(`wallets/${USER_ID}`);

    await expect(fn(REQUEST_ID, USER_ID)).rejects.toThrow("WALLET_NOT_FOUND");
  });

  it("wraps an unexpected transaction failure instead of leaking it", async () => {
    const fn = await withFreshService(QUOTED_REQUEST, { balance: 200 });
    const { WalletPaymentFailure } = await import("./walletPayment");
    fakeAdminDb.runTransaction.mockRejectedValueOnce(
      new Error("commit failed")
    );

    const error = await fn(REQUEST_ID, USER_ID).catch((e: unknown) => e);

    // Not a refusal the route can map, so it must arrive as a wrapped error.
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(WalletPaymentFailure);
  });
});

describe("walletPaymentErrorResponse", () => {
  const cases: [string, string, number][] = [
    ["REQUEST_NOT_FOUND", "Request not found.", 404],
    [
      "QUOTE_AMOUNT_MISSING",
      "This request has no quoted amount to pay yet.",
      400,
    ],
    ["ALREADY_PAID", "This request has already been paid.", 400],
    ["REQUEST_NOT_PAYABLE", "This request is no longer awaiting payment.", 409],
    [
      "QUOTE_EXPIRED",
      "This quotation has expired. Please request a new quote.",
      400,
    ],
    ["WALLET_NOT_FOUND", "Wallet not found.", 400],
    ["INSUFFICIENT_BALANCE", "Insufficient wallet balance.", 400],
  ];

  it.each(cases)("maps %s to a %i response", async (code, message, status) => {
    const { walletPaymentErrorResponse, WalletPaymentFailure } =
      await import("./walletPayment");

    expect(
      walletPaymentErrorResponse(new WalletPaymentFailure(code as never))
    ).toEqual({
      code,
      message,
      status,
    });
  });

  it("does not depend on error messages", async () => {
    const { walletPaymentErrorResponse } = await import("./walletPayment");

    // A reworded or wrapped message must not turn a known refusal into a 500.
    expect(
      walletPaymentErrorResponse(new Error("REQUEST_NOT_FOUND"))
    ).toBeNull();
  });

  it("returns null for an unrecognised error", async () => {
    const { walletPaymentErrorResponse } = await import("./walletPayment");

    expect(walletPaymentErrorResponse(new Error("something else"))).toBeNull();
  });

  it("returns null for a non-Error rejection", async () => {
    const { walletPaymentErrorResponse } = await import("./walletPayment");

    expect(walletPaymentErrorResponse("nope")).toBeNull();
    expect(walletPaymentErrorResponse(undefined)).toBeNull();
  });

  it("returns null for a refusal code it does not map", async () => {
    const { walletPaymentErrorResponse, WalletPaymentFailure } =
      await import("./walletPayment");

    expect(
      walletPaymentErrorResponse(new WalletPaymentFailure("UNMAPPED" as never))
    ).toBeNull();
  });
});
