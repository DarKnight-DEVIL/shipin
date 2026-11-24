import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import type { DocumentSnapshot, Transaction } from "firebase-admin/firestore";

/*
 * Every function here reads and writes through `adminDb`, so the double models
 * documents by path and records what a transaction wrote. Without it only the
 * pure helpers were reachable, and the release path — where `wallets.reserved`
 * is decremented — had no unit coverage at all.
 */
const db = vi.hoisted(() => ({
  docs: {} as Record<string, Record<string, unknown> | undefined>,
  expired: [] as Array<{ id: string; data: Record<string, unknown> }>,
  hasWhere: true,
  txSets: [] as Array<{ path: string; data: Record<string, unknown> }>,
  txDeletes: [] as string[],
  runTransaction: vi.fn(),
}));

vi.mock("@/lib/firebaseAdmin", () => ({
  adminDb: {
    collection: (name: string) => {
      const doc = (id: string) => ({ path: `${name}/${id}`, id });
      if (!db.hasWhere) return { doc };

      return {
        doc,
        where: () => ({
          limit: () => ({
            get: async () => ({
              docs: db.expired.map((hold) => ({
                id: hold.id,
                data: () => hold.data,
              })),
            }),
          }),
        }),
      };
    },
    runTransaction: db.runTransaction,
  },
}));

// The write sentinel needs no Firestore app; stubbing it keeps the assertions
// reading the numbers the release actually writes.
vi.mock("firebase-admin/firestore", () => ({
  FieldValue: { serverTimestamp: () => "server-timestamp" },
}));

import {
  availableWalletBalance,
  deleteConsumedWalletHold,
  releaseExpiredWalletHolds,
  releaseWalletHold,
  reservedAfterRelease,
  reservedBalance,
  walletHoldDocId,
} from "./walletHolds";

const snapshot = (data: Record<string, unknown> | undefined) =>
  ({
    exists: data !== undefined,
    data: () => data,
  }) as unknown as DocumentSnapshot;

function transaction() {
  return {
    get: async (ref: { path: string }) => {
      const data = db.docs[ref.path];
      return { exists: data !== undefined, data: () => data };
    },
    set: (ref: { path: string }, data: Record<string, unknown>) => {
      db.txSets.push({ path: ref.path, data });
    },
    delete: (ref: { path: string }) => {
      db.txDeletes.push(ref.path);
    },
  };
}

beforeEach(() => {
  db.docs = {};
  db.expired = [];
  db.hasWhere = true;
  db.txSets = [];
  db.txDeletes = [];
  db.runTransaction
    .mockReset()
    .mockImplementation(async (fn: (t: unknown) => unknown) =>
      fn(transaction())
    );
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("wallet holds", () => {
  it("never reports more available balance than the unreserved part", () => {
    expect(availableWalletBalance({ balance: 100, reserved: 30 })).toBe(70);
    expect(availableWalletBalance({ balance: 100 })).toBe(100);
    // Corrupt data must not produce a spendable negative or a huge number.
    expect(availableWalletBalance({ balance: 10, reserved: 50 })).toBe(0);
    expect(availableWalletBalance({ balance: 10, reserved: -5 })).toBe(10);
    expect(availableWalletBalance({ balance: "nope", reserved: 1 })).toBe(0);
  });

  it("clamps the reserved amount at zero", () => {
    expect(reservedBalance({ reserved: -5 })).toBe(0);
    expect(reservedBalance({ reserved: 12.345 })).toBe(12.35);
    expect(reservedBalance(undefined)).toBe(0);
  });

  it("releases exactly the hold, leaving the other reservations alone", () => {
    const wallet = snapshot({ balance: 100, reserved: 50 });
    const hold = snapshot({ amount: 20, status: "reserved" });

    expect(reservedAfterRelease(wallet, hold)).toBe(30);
  });

  it("does not release a hold twice", () => {
    const wallet = snapshot({ balance: 100, reserved: 50 });

    expect(reservedAfterRelease(wallet, snapshot({ status: "settled" }))).toBe(
      50
    );
    expect(reservedAfterRelease(wallet, snapshot(undefined))).toBe(50);
  });

  it("keeps the reserved total non-negative when the hold exceeds it", () => {
    expect(
      reservedAfterRelease(
        snapshot({ balance: 100, reserved: 10 }),
        snapshot({ amount: 20, status: "reserved" })
      )
    ).toBe(0);
  });

  it("derives a stable, path-safe hold id from the checkout key", () => {
    const id = walletHoldDocId("req-1:main:main");

    expect(id).toBe(walletHoldDocId("req-1:main:main"));
    expect(id).not.toContain("/");
    expect(id).not.toContain("+");
  });
});

describe("deleteConsumedWalletHold", () => {
  it("deletes the hold it was given", () => {
    const tx = { delete: vi.fn() };

    deleteConsumedWalletHold(
      tx as unknown as Transaction,
      { path: "walletHolds/hold-1" } as never,
      snapshot({ amount: 20, status: "reserved" })
    );

    expect(tx.delete).toHaveBeenCalledTimes(1);
  });

  it("does nothing without a hold reference or document", () => {
    const tx = { delete: vi.fn() };

    deleteConsumedWalletHold(
      tx as unknown as Transaction,
      null,
      snapshot({ amount: 20, status: "reserved" })
    );
    deleteConsumedWalletHold(
      tx as unknown as Transaction,
      { path: "walletHolds/hold-1" } as never,
      snapshot(undefined)
    );

    expect(tx.delete).not.toHaveBeenCalled();
  });
});

describe("releaseWalletHold", () => {
  it("frees exactly the hold's amount and deletes the hold", async () => {
    db.docs["wallets/user-1"] = { balance: 100, reserved: 50 };
    db.docs["walletHolds/hold-1"] = {
      userId: "user-1",
      amount: 20,
      status: "reserved",
    };

    await releaseWalletHold("hold-1", "user-1");

    expect(db.txSets).toEqual([
      {
        path: "wallets/user-1",
        data: expect.objectContaining({ reserved: 30 }),
      },
    ]);
    expect(db.txDeletes).toEqual(["walletHolds/hold-1"]);
  });

  it("does not create a wallet document that never existed", async () => {
    db.docs["walletHolds/hold-1"] = {
      userId: "user-1",
      amount: 20,
      status: "reserved",
    };

    await releaseWalletHold("hold-1", "user-1");

    expect(db.txSets).toEqual([]);
    expect(db.txDeletes).toEqual(["walletHolds/hold-1"]);
  });

  it("leaves the reservation alone when the hold is already gone", async () => {
    db.docs["wallets/user-1"] = { balance: 100, reserved: 50 };

    await releaseWalletHold("hold-1", "user-1");

    expect(db.txSets).toEqual([
      {
        path: "wallets/user-1",
        data: expect.objectContaining({ reserved: 50 }),
      },
    ]);
    expect(db.txDeletes).toEqual([]);
  });
});

describe("releaseExpiredWalletHolds", () => {
  it("releases the reservations of expired holds", async () => {
    db.expired = [
      {
        id: "hold-1",
        data: { userId: "user-1", amount: 20, status: "reserved" },
      },
    ];
    db.docs["wallets/user-1"] = { balance: 50, reserved: 20 };
    db.docs["walletHolds/hold-1"] = {
      userId: "user-1",
      amount: 20,
      status: "reserved",
    };

    await expect(releaseExpiredWalletHolds()).resolves.toBe(1);

    expect(db.txSets).toEqual([
      { path: "wallets/user-1", data: expect.objectContaining({ reserved: 0 }) },
    ]);
    expect(db.txDeletes).toEqual(["walletHolds/hold-1"]);
  });

  it("skips settled holds and holds with no owner", async () => {
    db.expired = [
      {
        id: "settled",
        data: { userId: "user-1", amount: 20, status: "settled" },
      },
      { id: "orphaned", data: { amount: 20, status: "reserved" } },
    ];

    await expect(releaseExpiredWalletHolds()).resolves.toBe(0);
    expect(db.runTransaction).not.toHaveBeenCalled();
  });

  it("keeps sweeping when one release fails", async () => {
    db.expired = [
      {
        id: "contended",
        data: { userId: "user-1", amount: 20, status: "reserved" },
      },
      {
        id: "fine",
        data: { userId: "user-2", amount: 5, status: "reserved" },
      },
    ];
    db.docs["wallets/user-2"] = { balance: 10, reserved: 5 };
    db.docs["walletHolds/fine"] = {
      userId: "user-2",
      amount: 5,
      status: "reserved",
    };

    db.runTransaction
      .mockRejectedValueOnce(new Error("contention"))
      .mockImplementation(async (fn: (t: unknown) => unknown) =>
        fn(transaction())
      );

    await expect(releaseExpiredWalletHolds()).resolves.toBe(1);
    expect(db.txDeletes).toEqual(["walletHolds/fine"]);
  });

  it("does nothing when the store cannot be queried", async () => {
    db.hasWhere = false;

    await expect(releaseExpiredWalletHolds()).resolves.toBe(0);
  });
});
