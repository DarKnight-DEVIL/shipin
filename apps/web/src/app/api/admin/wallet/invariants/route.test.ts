// @vitest-environment node

/**
 * `POST /api/admin/wallet/invariants` — the nightly read-only wallet sweep.
 *
 * The job is only useful if it flags every real disagreement and never invents
 * one. The cases that matter most are the quiet ones: rounding that is equal in
 * cents but not as floats, legacy string amounts, a released hold that must not
 * count as reserved, and a scan that hits its page cap (where a partial ledger
 * sum would make every wallet look wrong).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import crypto from "crypto";

interface FakeDoc {
  id: string;
  fields: Record<string, unknown>;
}

const mocks = vi.hoisted(() => {
  const state = {
    wallets: [] as FakeDoc[],
    ledger: [] as FakeDoc[],
    holds: [] as FakeDoc[],
    system: {} as Record<string, Record<string, unknown>>,
    writes: [] as Array<{ path: string; value: Record<string, unknown> }>,
  };

  const readPath = (doc: FakeDoc | undefined, path: string): unknown =>
    path.split(".").reduce<unknown>((value, key) => {
      if (typeof value !== "object" || value === null) return undefined;
      return (value as Record<string, unknown>)[key];
    }, doc?.fields);

  const snapshotOf = (doc: FakeDoc | undefined) => ({
    id: doc?.id,
    exists: doc !== undefined,
    get: (path: string) => readPath(doc, path),
    data: () => doc?.fields,
  });

  const collection = (name: string) => {
    const rows = (): FakeDoc[] =>
      name === "wallets"
        ? state.wallets
        : name === "walletTransactions"
          ? state.ledger
          : name === "walletHolds"
            ? state.holds
            : [];

    const query = {
      orderBy: () => query,
      limit: () => query,
      startAfter: () => query,
      get: async () => {
        const matched = rows();
        return { size: matched.length, docs: matched.map(snapshotOf) };
      },
    };

    return {
      ...query,
      doc: (id?: string) => ({
        id,
        get: async () => {
          if (name === "system") {
            const stored = id ? state.system[id] : undefined;
            return snapshotOf(
              stored ? { id: id as string, fields: stored } : undefined
            );
          }
          return snapshotOf(rows().find((row) => row.id === id));
        },
        set: async (value: Record<string, unknown>) => {
          state.writes.push({ path: `${name}/${id}`, value });
          if (name === "system" && id) state.system[id] = value;
        },
      }),
    };
  };

  return { state, collection };
});

vi.mock("@/lib/firebaseAdmin", () => ({
  adminDb: { collection: mocks.collection },
}));

import { POST } from "./route";

const SECRET = "cron-secret-value";

function wallet(fields: Partial<FakeDoc["fields"]> = {}, id = "w1") {
  mocks.state.wallets.push({
    id,
    fields: { balance: 0, reserved: 0, currency: "USD", ...fields },
  });
}

function ledgerEntry(
  userId: string,
  amount: number | string,
  id = `tx-${mocks.state.ledger.length + 1}`
) {
  mocks.state.ledger.push({ id, fields: { userId, amount } });
}

function hold(
  userId: string,
  amount: number,
  status = "reserved",
  id = `hold-${mocks.state.holds.length + 1}`
) {
  mocks.state.holds.push({ id, fields: { userId, amount, status } });
}

function signedRequest(): NextRequest {
  const timestamp = String(Date.now());
  const signature = crypto
    .createHmac("sha256", SECRET)
    .update(`${timestamp}|`)
    .digest("hex");

  return new NextRequest("http://localhost/api/admin/wallet/invariants", {
    method: "POST",
    headers: {
      "x-cron-timestamp": timestamp,
      "x-cron-signature": signature,
    },
  });
}

beforeEach(() => {
  mocks.state.wallets = [];
  mocks.state.ledger = [];
  mocks.state.holds = [];
  mocks.state.system = {};
  mocks.state.writes = [];
  vi.stubEnv("CRON_SECRET", SECRET);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("POST /api/admin/wallet/invariants — auth", () => {
  it("refuses an unsigned caller and writes no verdict", async () => {
    const response = await POST(
      new NextRequest("http://localhost/api/admin/wallet/invariants", {
        method: "POST",
      })
    );

    expect(response.status).toBe(401);
    expect(mocks.state.writes).toHaveLength(0);
  });

  it("fails closed when CRON_SECRET is missing", async () => {
    vi.stubEnv("CRON_SECRET", "");

    const response = await POST(signedRequest());

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      code: "CONFIG_ERROR",
    });
  });
});

describe("POST /api/admin/wallet/invariants — agreement", () => {
  it("passes a wallet whose balance and reservation match the ledger", async () => {
    wallet({ balance: 100, reserved: 25 });
    ledgerEntry("w1", 120);
    ledgerEntry("w1", -20);
    hold("w1", 25);
    // A released hold is not money promised to a checkout and must not count.
    hold("w1", 10, "released");
    // Another customer's rows must not leak into w1's sums.
    ledgerEntry("w2", 999);
    hold("w2", 999);

    const response = await POST(signedRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.drift).toEqual([]);
    expect(body.checked).toEqual({
      wallets: 1,
      ledgerEntries: 3,
      // Both reserved holds count (the other customer's 999 included); only
      // the released one is excluded. If w2's hold leaked into w1's sum, the
      // reservation check above would have failed.
      activeHolds: 2,
    });
  });

  it("compares in cents, not raw floats", async () => {
    wallet({ balance: 0.3 });
    ledgerEntry("w1", 0.1);
    ledgerEntry("w1", 0.2);

    const response = await POST(signedRequest());

    expect(response.status).toBe(200);
  });

  it("reads legacy string amounts as money", async () => {
    wallet({ balance: "10.00" });
    ledgerEntry("w1", "10");

    const response = await POST(signedRequest());

    expect(response.status).toBe(200);
  });

  it("accepts an untouched wallet with no ledger rows", async () => {
    wallet();

    const response = await POST(signedRequest());

    expect(response.status).toBe(200);
  });

  it("reconciles a wallet that holds only integer minor units", async () => {
    // ADR-0008 phase 4. The sweep read the decimal fields directly, so once the
    // writers stopped producing them it would have summed zero from the ledger
    // and compared it against zero from the wallet — reporting every wallet as
    // reconciled while checking nothing.
    mocks.state.wallets.push({
      id: "w1",
      fields: { balanceMinor: 10000, reservedMinor: 2500, currency: "USD" },
    });
    mocks.state.ledger.push({ id: "tx-1", fields: { userId: "w1", amountMinor: 12000 } });
    mocks.state.ledger.push({ id: "tx-2", fields: { userId: "w1", amountMinor: -2000 } });
    mocks.state.holds.push({ id: "hold-1", fields: { userId: "w1", amount: 25, status: "reserved" } });

    const response = await POST(signedRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.drift).toEqual([]);
  });

  it("still catches drift when the documents carry only minor units", async () => {
    mocks.state.wallets.push({
      id: "w1",
      fields: { balanceMinor: 9500, reservedMinor: 0, currency: "USD" },
    });
    mocks.state.ledger.push({ id: "tx-1", fields: { userId: "w1", amountMinor: 8000 } });

    const response = await POST(signedRequest());
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.drift).toEqual([
      expect.objectContaining({
        kind: "wallet_balance_mismatch",
        detail: expect.stringContaining("95.00"),
      }),
    ]);
  });
});

describe("POST /api/admin/wallet/invariants — drift", () => {
  it("flags a balance the ledger cannot explain", async () => {
    wallet({ balance: 95 });
    ledgerEntry("w1", 100);

    const response = await POST(signedRequest());
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.code).toBe("WALLET_INVARIANT_DRIFT");
    expect(body.drift).toEqual([
      expect.objectContaining({
        kind: "wallet_balance_mismatch",
        walletId: "w1",
      }),
    ]);
    expect(body.drift[0].detail).toContain("ledger sums to 100.00");
    expect(console.error).toHaveBeenCalled();
  });

  it("flags a negative balance", async () => {
    wallet({ balance: -5 });
    ledgerEntry("w1", -5);

    const response = await POST(signedRequest());
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.drift).toHaveLength(1);
    expect(body.drift[0]).toMatchObject({
      kind: "wallet_negative_balance",
      walletId: "w1",
    });
  });

  it("flags a reservation the active holds cannot explain", async () => {
    wallet({ reserved: 40 });
    hold("w1", 25);
    hold("w1", 10, "released");

    const response = await POST(signedRequest());
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.drift[0]).toMatchObject({
      kind: "wallet_reserved_mismatch",
      walletId: "w1",
    });
    expect(body.drift[0].detail).toContain("active holds sum to 25.00");
  });

  it("reports both balance and reservation drift for the same wallet", async () => {
    wallet({ balance: 5, reserved: 9 });
    ledgerEntry("w1", 10);
    hold("w1", 3);

    const response = await POST(signedRequest());
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.drift.map((entry: { kind: string }) => entry.kind)).toEqual([
      "wallet_balance_mismatch",
      "wallet_reserved_mismatch",
    ]);
  });
});

describe("POST /api/admin/wallet/invariants — verdict", () => {
  it("reads every stored firstSeenAt shape and ignores junk entries", async () => {
    const seen = new Date("2026-01-01T00:00:00Z");
    mocks.state.system.walletInvariants = {
      drift: [
        {
          kind: "wallet_balance_mismatch",
          walletId: "w1",
          // Firestore Timestamp shape.
          firstSeenAt: { toDate: () => seen },
        },
        {
          kind: "wallet_reserved_mismatch",
          walletId: "w2",
          firstSeenAt: { toDate: () => ({}) },
        },
        {
          kind: "wallet_negative_balance",
          walletId: "w3",
          firstSeenAt: { toDate: 42 },
        },
        { kind: "wallet_negative_balance", walletId: "w4", firstSeenAt: {} },
        {
          kind: "wallet_negative_balance",
          walletId: "w5",
          firstSeenAt: "2026-01-01T00:00:00Z",
        },
        {
          kind: "wallet_negative_balance",
          walletId: "w6",
          firstSeenAt: "not-a-date",
        },
        {
          kind: "wallet_negative_balance",
          walletId: "w7",
          firstSeenAt: 1767225600000,
        },
        {
          kind: "wallet_balance_mismatch",
          walletId: "w8",
          firstSeenAt: seen,
        },
        null,
        "junk",
        { kind: 42, walletId: "w9" },
        { kind: "wallet_balance_mismatch", walletId: 42 },
      ],
    };
    wallet({ balance: 95 }, "w1");
    ledgerEntry("w1", 100);

    const response = await POST(signedRequest());
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.drift[0].firstSeenAt).toBe(seen.toISOString());
  });

  it("ignores ledger and hold rows without an owner", async () => {
    mocks.state.ledger.push({ id: "tx-no-user", fields: { amount: 50 } });
    mocks.state.ledger.push({
      id: "tx-empty-user",
      fields: { userId: "", amount: 50 },
    });
    mocks.state.holds.push({
      id: "hold-no-user",
      fields: { amount: 10, status: "reserved" },
    });
    mocks.state.holds.push({
      id: "hold-empty-user",
      fields: { userId: "", amount: 10, status: "reserved" },
    });

    const response = await POST(signedRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.checked).toEqual({
      wallets: 0,
      ledgerEntries: 2,
      activeHolds: 0,
    });
  });

  it("keeps the age of a case that is still open", async () => {
    const seen = new Date("2026-01-01T00:00:00Z");
    mocks.state.system.walletInvariants = {
      drift: [
        {
          kind: "wallet_balance_mismatch",
          walletId: "w1",
          firstSeenAt: seen,
        },
      ],
    };
    wallet({ balance: 95 });
    ledgerEntry("w1", 100);

    const response = await POST(signedRequest());
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.drift[0].firstSeenAt).toBe(seen.toISOString());
  });

  it("drops a case once the wallet is fixed", async () => {
    wallet({ balance: 95 });
    ledgerEntry("w1", 100);

    expect((await POST(signedRequest())).status).toBe(409);

    // Correct the balance to the value the ledger already explains.
    mocks.state.wallets[0].fields.balance = 100;

    const second = await POST(signedRequest());

    expect(second.status).toBe(200);
    await expect(second.json()).resolves.toMatchObject({ drift: [] });
    expect(mocks.state.system.walletInvariants.drift).toEqual([]);
  });

  it("reports a truncated scan instead of inventing drift", async () => {
    // One full page is enough to make the fake paginate to the cap: the same
    // page is returned with a cursor, so the scan ends truncated.
    for (let index = 0; index < 200; index += 1) {
      wallet({ balance: 0 }, `w-${index}`);
    }

    const response = await POST(signedRequest());
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.code).toBe("WALLET_SWEEP_TRUNCATED");
    expect(body.truncated).toBe(true);
    // Partial sums would mark every wallet wrong; none are reported.
    expect(body.drift).toEqual([]);
  });

  it("stores the verdict for the next run and for operators", async () => {
    wallet({ balance: 100 });
    ledgerEntry("w1", 100);

    await POST(signedRequest());

    expect(mocks.state.writes).toEqual([
      expect.objectContaining({
        path: "system/walletInvariants",
        value: expect.objectContaining({
          checked: { wallets: 1, ledgerEntries: 1, activeHolds: 0 },
          driftCount: 0,
          truncated: false,
        }),
      }),
    ]);
  });
});
