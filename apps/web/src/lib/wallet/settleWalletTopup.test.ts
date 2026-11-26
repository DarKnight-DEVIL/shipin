// @vitest-environment node

/**
 * Crediting a wallet top-up PayPal already captured.
 *
 * Its only caller now is the recovery sweep: customers cannot create top-ups any more,
 * but orders created before that still carry `capturePending: true` and must be settled
 * exactly once. So the two things worth pinning are the refusals (a mismatched or
 * non-USD capture must not credit) and the idempotency that lets a sweep run while a
 * browser is retrying.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  walletGet: vi.fn(),
  ledgerGet: vi.fn(),
  update: vi.fn(),
  set: vi.fn(),
  runTransaction: vi.fn(),
  minorOnly: true,
}));

vi.mock("@/lib/firebaseAdmin", () => ({
  adminDb: {
    collection: (name: string) => ({
      // The reference carries its collection so the transaction fake can answer the
      // right read: the wallet and the ledger entry are different documents.
      doc: () => ({ __collection: name }),
    }),
    runTransaction: (handler: (tx: unknown) => Promise<unknown>) =>
      mocks.runTransaction(handler),
  },
}));

vi.mock("@/lib/moneyMode", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/moneyMode")>();
  return {
    ...actual,
    isMinorOnlyMode: () => mocks.minorOnly,
  };
});

import { settleWalletTopup } from "./settleWalletTopup";

const orderRef = { id: "ORDER-1", path: "walletTopupOrders/ORDER-1" } as never;

const topupOrder = (overrides: Record<string, unknown> = {}) => ({
  amount: 50,
  userId: "user-1",
  orderId: "ORDER-1",
  ...overrides,
});

const capture = (overrides: Record<string, unknown> = {}) => ({
  captureId: "CAP-1",
  amount: 50,
  currency: "USD",
  ...overrides,
});

const snapshot = (data: Record<string, unknown> | undefined) => ({
  exists: data !== undefined,
  data: () => data,
});

beforeEach(() => {
  mocks.minorOnly = true;
  mocks.update.mockReset();
  mocks.set.mockReset();
  mocks.walletGet.mockReset().mockResolvedValue(
    snapshot({ balance: 10, balanceMinor: 1000 })
  );
  mocks.ledgerGet.mockReset().mockResolvedValue(snapshot(undefined));

  // A transaction that answers the two reads by collection and records every write.
  mocks.runTransaction.mockReset().mockImplementation(
    async (handler: (tx: unknown) => Promise<unknown>) =>
      handler({
        get: async (ref: { __collection?: string }) =>
          ref.__collection === "wallets" ? mocks.walletGet() : mocks.ledgerGet(),
        update: mocks.update,
        set: mocks.set,
      })
  );
});

/** No existing ledger entry: the credit has not been written yet. */
function newCredit() {
  mocks.walletGet.mockResolvedValue(snapshot({ balance: 10, balanceMinor: 1000 }));
  mocks.ledgerGet.mockResolvedValue(snapshot(undefined));
}

/** The ledger entry already exists: a retry must not credit twice. */
function alreadyCredited() {
  mocks.ledgerGet.mockResolvedValue(
    snapshot({ balanceAfter: 60, balanceAfterMinor: 6000 })
  );
}

describe("settleWalletTopup", () => {
  it("refuses a capture that does not match the stored amount", async () => {
    newCredit();

    await expect(
      settleWalletTopup({
        topupOrderRef: orderRef,
        topupOrder: topupOrder({ amount: 50 }) as never,
        capture: capture({ amount: 60 }) as never,
      })
    ).resolves.toMatchObject({ ok: false, status: 400 });

    expect(mocks.set).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("refuses a capture in another currency", async () => {
    newCredit();

    await expect(
      settleWalletTopup({
        topupOrderRef: orderRef,
        topupOrder: topupOrder() as never,
        capture: capture({ currency: "EUR" }) as never,
      })
    ).resolves.toMatchObject({ ok: false, status: 400 });
  });

  it("refuses a non-positive capture amount", async () => {
    newCredit();

    for (const amount of [0, -5, Number.NaN]) {
      await expect(
        settleWalletTopup({
          topupOrderRef: orderRef,
          topupOrder: topupOrder() as never,
          capture: capture({ amount }) as never,
        })
      ).resolves.toMatchObject({ ok: false, status: 400 });
    }
  });

  it("refuses an order with no user to credit", async () => {
    newCredit();

    await expect(
      settleWalletTopup({
        topupOrderRef: orderRef,
        topupOrder: topupOrder({ userId: "" }) as never,
        capture: capture() as never,
      })
    ).resolves.toMatchObject({ ok: false, status: 500 });
    expect(mocks.set).not.toHaveBeenCalled();
  });

  it("credits once, and clears the pending flag on the order", async () => {
    newCredit();

    const result = await settleWalletTopup({
      topupOrderRef: orderRef,
      topupOrder: topupOrder() as never,
      capture: capture() as never,
    });

    expect(result).toMatchObject({ ok: true, alreadyProcessed: false, balance: 60 });
    // The ledger document is keyed on the capture id, which is what makes a retry safe.
    expect(mocks.set).toHaveBeenCalledTimes(1);
    expect(mocks.update).toHaveBeenCalledWith(
      orderRef,
      expect.objectContaining({ status: "completed", capturePending: false })
    );
  });

  it("creates the wallet document when the account has none yet", async () => {
    mocks.walletGet.mockResolvedValue(snapshot(undefined));
    mocks.ledgerGet.mockResolvedValue(snapshot(undefined));

    const result = await settleWalletTopup({
      topupOrderRef: orderRef,
      topupOrder: topupOrder() as never,
      capture: capture() as never,
    });

    expect(result).toMatchObject({ ok: true, balance: 50 });
    expect(mocks.set).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ currency: "USD" })
    );
    expect(mocks.update).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ balanceMinor: expect.anything() })
    );
  });

  it("writes the decimal balance too in mixed mode, and only minor units in minor-only", async () => {
    /*
     * ADR-0008 phase 4: during migration a wallet carries both fields, and the decimal
     * is an increment while the minor balance is absolute. In minor-only mode the decimal
     * write must be absent, or a rollback would read a field nobody updates.
     */
    newCredit();
    mocks.minorOnly = false;

    await settleWalletTopup({
      topupOrderRef: orderRef,
      topupOrder: topupOrder() as never,
      capture: capture() as never,
    });

    expect(mocks.update).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ balanceMinor: 6000 })
    );

    mocks.minorOnly = true;
    mocks.update.mockReset();
    mocks.ledgerGet.mockResolvedValue(snapshot(undefined));

    await settleWalletTopup({
      topupOrderRef: orderRef,
      topupOrder: topupOrder() as never,
      capture: capture() as never,
    });

    const walletUpdate = mocks.update.mock.calls.find(
      ([, data]) => data && typeof data === "object" && "balanceMinor" in data
    );
    expect(walletUpdate?.[1]).not.toHaveProperty("balance");
  });

  it("reports an existing credit instead of crediting again", async () => {
    alreadyCredited();

    const result = await settleWalletTopup({
      topupOrderRef: orderRef,
      topupOrder: topupOrder() as never,
      capture: capture() as never,
    });

    expect(result).toMatchObject({ ok: true, alreadyProcessed: true, balance: 60 });
    expect(mocks.set).not.toHaveBeenCalled();
  });
});
