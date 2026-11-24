/**
 * `GET /api/admin/requests` — the admin request list.
 *
 * The route is a thin serializer over the `requests` collection: it must not
 * leak Firestore Timestamp objects into JSON, must default every missing field,
 * and must answer 401/403 through the admin gate instead of a 500.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => {
  /**
   * A chainable stand-in for the Firestore query the route builds, so each
   * test can assert the filters it applied (`where`, `orderBy`, `limit`,
   * `startAfter`) and choose what `get()` resolves to.
   */
  const makeCollection = () => {
    const calls: Array<{ method: string; args: unknown[] }> = [];
    const chain: Record<string, (...args: unknown[]) => unknown> = {};
    const step =
      (method: string) =>
      (...args: unknown[]) => {
        calls.push({ method, args });
        return chain;
      };
    chain.where = step("where");
    chain.orderBy = step("orderBy");
    chain.limit = step("limit");
    chain.startAfter = step("startAfter");
    chain.get = () => {
      calls.push({ method: "get", args: [] });
      return mocks.get();
    };
    return { chain, calls };
  };

  return {
    requireAdmin: vi.fn(),
    get: vi.fn(),
    collection: vi.fn(),
    makeCollection,
  };
});

vi.mock("@/lib/firebaseAdmin", () => ({
  adminDb: { collection: () => mocks.collection() },
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

const request = (search = "") =>
  new NextRequest(`https://shipin.test/api/admin/requests${search}`);

const doc = (id: string, data: Record<string, unknown>) => ({
  id,
  data: () => data,
  // `toAdminPage` reads `createdAt` off the snapshot to build the cursor.
  get: (field: string) => data[field],
});

let calls: Array<{ method: string; args: unknown[] }>;

beforeEach(() => {
  mocks.requireAdmin
    .mockReset()
    .mockResolvedValue({ uid: "admin-1", mfaVerified: true });
  mocks.get.mockReset().mockResolvedValue({ docs: [] });
  const chain = mocks.makeCollection();
  calls = chain.calls;
  mocks.collection.mockReset().mockReturnValue(chain.chain);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("GET /api/admin/requests", () => {
  it("returns the whole document, not a projection", async () => {
    mocks.get.mockResolvedValue({
      docs: [
        doc("req-1", {
          userId: "user-1",
          customerName: "Ada",
          email: "ada@example.com",
          status: "submitted",
          // What the Admin SDK hands back for a Firestore Timestamp.
          createdAt: {
            seconds: 1700000000,
            nanoseconds: 500,
            toDate: () => new Date(1700000000500),
          },
          // Already-serialized timestamps, as written by another route.
          updatedAt: { seconds: 1700000100, nanoseconds: 0 },
          // The fields the purchasing queue and the queue filters read. Each
          // one used to be dropped here and arrived as `undefined`.
          items: [{ name: "Toy car", quantity: 2 }],
          quote: { breakdown: { grandTotal: 523.33 } },
          refundRequest: { status: "requested" },
          purchases: [
            {
              vendor: "Amazon",
              purchasedAt: { seconds: 1700000200, nanoseconds: 0 },
            },
          ],
          quoteRegenerationRequested: true,
        }),
        doc("req-2", {}),
        doc("req-3", {
          createdAt: "not-a-timestamp",
          updatedAt: { seconds: "soon" },
        }),
      ],
    });

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body.requests).toEqual([
      {
        id: "req-1",
        userId: "user-1",
        customerName: "Ada",
        email: "ada@example.com",
        status: "submitted",
        createdAt: { seconds: 1700000000, nanoseconds: 500 },
        updatedAt: { seconds: 1700000100, nanoseconds: 0 },
        items: [{ name: "Toy car", quantity: 2 }],
        quote: { breakdown: { grandTotal: 523.33 } },
        refundRequest: { status: "requested" },
        purchases: [
          {
            vendor: "Amazon",
            purchasedAt: { seconds: 1700000200, nanoseconds: 0 },
          },
        ],
        quoteRegenerationRequested: true,
      },
      { id: "req-2", userId: "", customerName: "", email: "", status: "" },
      // Nothing here is a Timestamp, so nothing is rewritten: the route copies
      // documents, it does not repair them.
      {
        id: "req-3",
        userId: "",
        customerName: "",
        email: "",
        status: "",
        createdAt: "not-a-timestamp",
        updatedAt: { seconds: "soon" },
      },
    ]);
    // A page smaller than the limit is the last page.
    expect(body.hasMore).toBe(false);
    expect(body.nextCursor).toBeNull();
  });

  it("orders newest first and bounds the page", async () => {
    const response = await GET(request("?limit=2"));

    expect(response.status).toBe(200);
    expect(calls.map((call) => call.method)).toEqual([
      "orderBy",
      "limit",
      "get",
    ]);
    expect(calls[0].args).toEqual(["createdAt", "desc"]);
    expect(calls[1].args).toEqual([2]);
  });

  it("pushes the status filter down to the query", async () => {
    mocks.get.mockResolvedValue({ docs: [] });

    const response = await GET(request("?status=paid"));

    expect(response.status).toBe(200);
    expect(calls.map((call) => call.method)).toEqual([
      "where",
      "orderBy",
      "limit",
      "get",
    ]);
    expect(calls[0].args).toEqual(["status", "==", "paid"]);
  });

  it("rejects a status the product does not have", async () => {
    const response = await GET(request("?status=express"));

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      success: false,
      code: "UNKNOWN_STATUS",
    });
    expect(calls).toEqual([]);
  });

  it("serves a comma-separated status list as one `in` query", async () => {
    mocks.get.mockResolvedValue({ docs: [] });

    const response = await GET(
      request("?status=warehouse_received,packed,warehouse_received")
    );

    expect(response.status).toBe(200);
    expect(calls[0].args).toEqual([
      "status",
      "in",
      ["warehouse_received", "packed"],
    ]);
  });

  it("rejects a status list with an unknown member", async () => {
    const response = await GET(request("?status=paid,express"));

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      success: false,
      code: "UNKNOWN_STATUS",
    });
    expect(calls).toEqual([]);
  });

  it("rejects an empty status parameter", async () => {
    const response = await GET(request("?status="));

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      success: false,
      code: "UNKNOWN_STATUS",
    });
    expect(calls).toEqual([]);
  });

  it("continues after the cursor the previous page returned", async () => {
    const lastCreatedAt = 1_700_000_500_000;
    mocks.get.mockResolvedValue({
      docs: [doc("req-9", { createdAt: { toMillis: () => lastCreatedAt } })],
    });

    const first = await GET(request("?limit=1"));
    const body = await first.json();

    expect(body.hasMore).toBe(true);
    expect(body.nextCursor).toBeTruthy();

    // Round-trip the cursor the way the client does.
    const second = await GET(request(`?cursor=${body.nextCursor}`));

    expect(second.status).toBe(200);
    const startAfter = calls.find((call) => call.method === "startAfter");
    expect((startAfter?.args[0] as { toMillis: () => number }).toMillis()).toBe(
      lastCreatedAt
    );
  });

  it("rejects a cursor it cannot read", async () => {
    const response = await GET(request("?cursor=not-a-cursor"));

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      success: false,
      code: "INVALID_PAGE_PARAM",
    });
    expect(calls).toEqual([]);
  });

  it("rejects an unauthenticated caller", async () => {
    mocks.requireAdmin.mockRejectedValue(
      Object.assign(new Error("AUTHENTICATION_REQUIRED"), {})
    );

    const response = await GET(request());

    expect(response.status).toBe(401);
    expect(mocks.get).not.toHaveBeenCalled();
  });

  it("rejects a caller without the admin role", async () => {
    mocks.requireAdmin.mockRejectedValue(new Error("ADMIN_ACCESS_REQUIRED"));

    const response = await GET(request());

    expect(response.status).toBe(403);
    expect(mocks.get).not.toHaveBeenCalled();
  });

  it("returns 500 when the collection read fails", async () => {
    mocks.get.mockRejectedValue(new Error("firestore down"));

    const response = await GET(request());

    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({
      success: false,
      error: "Unable to load requests.",
    });
    expect(console.error).toHaveBeenCalled();
  });
});
