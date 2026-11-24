/**
 * `GET /api/admin/customers` — customer list plus per-request refund details.
 *
 * Two shapes on one URL: the default customer/wallet join, and `?requestId=`
 * which returns the raw request document the refund panel reads. Both are
 * admin-only, so the gate is asserted before either read happens.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  usersGet: vi.fn(),
  walletsGet: vi.fn(),
  requestDocGet: vi.fn(),
  /** Captures the `where("__name__", "in", chunk)` calls for the wallets. */
  walletFilters: vi.fn(),
  usersQueryCalls: vi.fn(),
}));

vi.mock("@/lib/firebaseAdmin", () => ({
  adminDb: {
    collection: (name: string) => {
      if (name === "wallets") {
        return {
          where: (...args: unknown[]) => {
            mocks.walletFilters(...args);
            return { get: mocks.walletsGet };
          },
        };
      }

      if (name === "users") {
        const calls: Array<{ method: string; args: unknown[] }> = [];
        const chain: Record<string, unknown> = {};
        const step =
          (method: string) =>
          (...args: unknown[]) => {
            calls.push({ method, args });
            return chain;
          };
        chain.orderBy = step("orderBy");
        chain.limit = step("limit");
        chain.startAfter = step("startAfter");
        chain.get = () => {
          calls.push({ method: "get", args: [] });
          return mocks.usersGet();
        };
        mocks.usersQueryCalls.mockReturnValue(calls);
        return chain;
      }

      // `requests`, for the ?requestId= branch.
      return {
        doc: (id: string) => ({
          id,
          get: () => mocks.requestDocGet(id),
        }),
      };
    },
  },
}));

vi.mock("@/lib/adminAuth", () => ({
  requireAdmin: mocks.requireAdmin,
  getAdminAuthError: (error: unknown) => {
    const message = error instanceof Error ? error.message : "";

    if (message === "AUTHENTICATION_REQUIRED") {
      return { status: 401, error: "Authentication required." };
    }
    if (message === "ADMIN_ACCESS_REQUIRED") {
      return { status: 403, error: "Administrator access required." };
    }
    return { status: 500, error: "Unable to verify administrator access." };
  },
}));

import { GET } from "./route";

const request = (query = "") =>
  new NextRequest(`https://shipin.test/api/admin/customers${query}`);

const doc = (id: string, data: Record<string, unknown>) => ({
  id,
  data: () => data,
  // `toAdminPage` reads `createdAt` off the snapshot to build the cursor.
  get: (field: string) => data[field],
});

beforeEach(() => {
  mocks.requireAdmin
    .mockReset()
    .mockResolvedValue({ uid: "admin-1", mfaVerified: true });
  mocks.usersGet.mockReset().mockResolvedValue({ docs: [] });
  mocks.walletsGet.mockReset().mockResolvedValue({ docs: [] });
  mocks.requestDocGet.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("GET /api/admin/customers — list", () => {
  it("joins wallets, defaults missing fields and drops administrators", async () => {
    mocks.usersGet.mockResolvedValue({
      docs: [
        doc("user-1", {
          displayName: "Ada",
          email: "ada@example.com",
          photoURL: "https://cdn.test/a.png",
          role: "customer",
        }),
        doc("user-2", {}),
        doc("admin-9", { displayName: "Root", role: "admin" }),
      ],
    });
    mocks.walletsGet.mockResolvedValue({
      docs: [
        doc("user-1", { balance: 42.5 }),
        doc("user-2", { balance: "not-a-number" }),
        doc("user-3", { balance: 99 }),
      ],
    });

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body.customers).toEqual([
      {
        id: "user-1",
        displayName: "Ada",
        email: "ada@example.com",
        photoURL: "https://cdn.test/a.png",
        role: "customer",
        walletBalance: 42.5,
      },
      {
        id: "user-2",
        displayName: "Unnamed Customer",
        email: "",
        photoURL: undefined,
        role: "customer",
        walletBalance: 0,
      },
    ]);
    // The user page is bounded and ordered by the query, not the route.
    const userCalls = mocks.usersQueryCalls();
    expect(userCalls[0]).toEqual({
      method: "orderBy",
      args: ["createdAt", "desc"],
    });
    expect(userCalls[1]).toEqual({ method: "limit", args: [100] });
    // One wallet query for a page that fits in a single `in`.
    expect(mocks.walletFilters).toHaveBeenCalledTimes(1);
    expect(body.hasMore).toBe(false);
    expect(body.nextCursor).toBeNull();
  });

  it("chunks the wallet lookup when the page exceeds the `in` cap", async () => {
    const docs = Array.from({ length: 35 }, (_, i) =>
      doc(`user-${i}`, { email: `${i}@example.com` })
    );
    mocks.usersGet.mockResolvedValue({ docs });

    const response = await GET(request());

    expect(response.status).toBe(200);
    expect(mocks.walletFilters).toHaveBeenCalledTimes(2);
    const [, , firstChunk] = mocks.walletFilters.mock.calls[0];
    const [, , secondChunk] = mocks.walletFilters.mock.calls[1];
    expect(firstChunk).toHaveLength(30);
    expect(secondChunk).toHaveLength(5);
  });

  it("continues after the cursor the previous page returned", async () => {
    mocks.usersGet.mockResolvedValue({
      docs: [doc("user-1", { createdAt: { toMillis: () => 7_000 } })],
    });

    const first = await GET(request("?limit=1"));
    const body = await first.json();

    expect(body.hasMore).toBe(true);
    expect(body.nextCursor).toBeTruthy();

    const second = await GET(request(`?cursor=${body.nextCursor}`));

    expect(second.status).toBe(200);
    expect(mocks.usersQueryCalls()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ method: "startAfter" }),
      ])
    );
  });

  it("rejects a cursor it cannot read", async () => {
    const response = await GET(request("?cursor=junk"));

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      success: false,
      code: "INVALID_PAGE_PARAM",
    });
  });
});

describe("GET /api/admin/customers — refund details", () => {
  it("404s for an unknown request", async () => {
    mocks.requestDocGet.mockResolvedValue({ exists: false });

    const response = await GET(request("?requestId=req-x"));

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      error: "Refund request not found.",
    });
  });

  it("returns the request document for a wallet-preference refund", async () => {
    mocks.requestDocGet.mockResolvedValue({
      exists: true,
      id: "req-1",
      data: () => ({
        userId: "user-1",
        refundRequest: { preference: "wallet", amount: 30, walletAmount: 0 },
      }),
    });

    const response = await GET(request("?requestId=req-1"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toMatchObject({
      schemaVersion: 2,
      refund: {
        id: "req-1",
        userId: "user-1",
        preference: "wallet",
        totalRefundAmount: 30,
        walletRefundAmount: 30,
      },
    });
  });

  it.each(["original_sources", "original_payment"])(
    "returns a %s refund that keeps the original wallet amount",
    async (preference) => {
      mocks.requestDocGet.mockResolvedValue({
        exists: true,
        id: "req-2",
        data: () => ({
          userId: "user-2",
          refundRequest: { preference, amount: 30 },
          payment: { walletAmount: 12 },
        }),
      });

      const response = await GET(request("?requestId=req-2"));

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({
        data: {
          schemaVersion: 2,
          refund: {
            id: "req-2",
            preference,
            totalRefundAmount: 30,
            walletRefundAmount: 12,
          },
        },
      });
    }
  );

  it("falls back to the legacy top-level fields for an unknown preference", async () => {
    mocks.requestDocGet.mockResolvedValue({
      exists: true,
      id: "req-3",
      data: () => ({
        userId: "user-3",
        preference: "cheque",
        amount: 5,
        walletAmount: 0,
      }),
    });

    const response = await GET(request("?requestId=req-3"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      data: {
        schemaVersion: 2,
        refund: { id: "req-3", preference: "cheque", totalRefundAmount: 5 },
      },
    });
  });
});

describe("GET /api/admin/customers — access control", () => {
  it("rejects an unauthenticated caller", async () => {
    mocks.requireAdmin.mockRejectedValue(new Error("AUTHENTICATION_REQUIRED"));

    const response = await GET(request());

    expect(response.status).toBe(401);
    expect(mocks.usersGet).not.toHaveBeenCalled();
    expect(mocks.walletsGet).not.toHaveBeenCalled();
  });

  it("rejects a caller without the admin role", async () => {
    mocks.requireAdmin.mockRejectedValue(new Error("ADMIN_ACCESS_REQUIRED"));

    const response = await GET(request());

    expect(response.status).toBe(403);
    expect(mocks.usersGet).not.toHaveBeenCalled();
  });

  it("returns 500 when the customer read fails", async () => {
    mocks.usersGet.mockRejectedValue(new Error("firestore down"));

    const response = await GET(request());

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      error: "Unable to load customers.",
    });
  });
});
