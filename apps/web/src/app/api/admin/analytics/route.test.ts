/**
 * `GET /api/admin/analytics` — the dashboard's single aggregate read.
 *
 * The route derives every dashboard number from the whole `requests`
 * collection, so the tests pin the buckets (paid statuses, operations,
 * overdue, revenue) rather than the presentation. A wrong bucket here is
 * invisible in the UI until someone reconciles the numbers by hand.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  get: vi.fn(),
  select: vi.fn(),
}));

vi.mock("@/lib/firebaseAdmin", () => ({
  adminDb: {
    collection: () => ({
      select: (...fields: string[]) => {
        mocks.select(fields);
        return {
          limit: () => ({ get: mocks.get }),
          get: mocks.get,
        };
      },
    }),
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

/*
 * The route caches its response for 60 seconds, so every test re-imports it:
 * a static import would share one cache across the whole file and the second
 * test would assert against the first test's numbers.
 */
type RouteModule = typeof import("./route");
let GET: RouteModule["GET"];

const request = () =>
  new NextRequest("https://shipin.test/api/admin/analytics");

const at = (date: Date) => ({ toDate: () => date });
const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000);

const doc = (id: string, data: Record<string, unknown>) => ({
  id,
  data: () => data,
});

beforeEach(async () => {
  vi.resetModules();
  ({ GET } = (await import("./route")) as RouteModule);
  mocks.requireAdmin
    .mockReset()
    .mockResolvedValue({ uid: "admin-1", mfaVerified: true });
  mocks.get.mockReset().mockResolvedValue({ docs: [] });
  mocks.select.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
});

describe("GET /api/admin/analytics", () => {
  it("aggregates every dashboard bucket", async () => {
    mocks.get.mockResolvedValue({
      docs: [
        doc("r1", {
          status: "paid",
          userId: "u1",
          customerName: "Ada",
          email: "ada@example.com",
          quote: {
            breakdown: {
              grandTotal: 100,
              serviceFee: 10,
              productsTotal: 70,
              domesticShipping: 5,
              internationalShipping: 15,
            },
          },
          createdAt: at(new Date("2026-03-15T10:00:00.000Z")),
          updatedAt: at(daysAgo(1)),
        }),
        doc("r2", {
          status: "shipped",
          userId: "u1",
          payment: { amount: 50 },
          createdAt: at(new Date("2026-03-20T10:00:00.000Z")),
          updatedAt: at(new Date()),
        }),
        doc("r3", { status: "submitted", userId: "u2", customerName: "Grace" }),
        doc("r4", {
          status: "delivered",
          userId: "u2",
          updatedAt: at(daysAgo(90)),
        }),
        doc("r5", {
          status: "warehouse_received",
          userId: "u3",
          updatedAt: at(daysAgo(20)),
        }),
        doc("r6", {
          status: "review",
          userId: "u3",
          quote: { breakdown: { grandTotal: 60 } },
          quoteRegenerationRequested: true,
        }),
        doc("r7", {
          status: "rejected",
          userId: "u4",
          quoteRegenerationRequested: true,
        }),
        doc("r8", {
          status: "refunded",
          userId: "u4",
          quoteRegenerationRequested: true,
        }),
        doc("r9", {
          status: "awaiting_payment",
          refundRequest: { status: "requested" },
        }),
        doc("r10", { status: "packed" }),
        doc("r11", { status: "ready_for_international_shipping" }),
      ],
    });

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");

    expect(body.stats).toMatchObject({
      totalRequests: 11,
      total: 11,
      submitted: 1,
      review: 1,
      quoteReady: 1,
      // r7 (rejected) and r8 (refunded) are excluded on purpose.
      quoteUpdates: 1,
      refundRequested: 1,
      awaitingPayment: 1,
      warehouse: 2,
      shipped: 1,
      delivered: 1,
      revenue: 150,
    });

    // Paid statuses: paid (r1), shipped (r2), warehouse_received (r5),
    // packed (r10), ready_for_international_shipping (r11), delivered (r4).
    // Only r1 carries a quote breakdown.
    expect(body.financials).toEqual({
      grossRevenue: 100,
      serviceFees: 10,
      productCost: 70,
      shippingCost: 20,
      paidOrders: 6,
      averageOrderValue: 16.67,
    });

    expect(body.operations).toEqual({
      awaitingQuote: 1,
      awaitingPayment: 1,
      warehouse: 2,
      readyToShip: 1,
      shippedToday: 1,
      // r4 is delivered (never overdue); r5 is 20 days old; r3/r10/r11 carry no
      // updatedAt, which counts as "not overdue" rather than "infinitely old".
      overdue: 1,
    });

    expect(body.statusDistribution).toEqual([
      { name: "Submitted", value: 1 },
      { name: "Review", value: 1 },
      { name: "Awaiting Payment", value: 1 },
      { name: "Warehouse", value: 2 },
      { name: "Shipped", value: 1 },
      { name: "Delivered", value: 1 },
    ]);

    // Paid requests only, and the key carries the year so March 2027 cannot
    // merge into March 2026.
    expect(body.monthlyRevenue).toEqual([{ month: "2026-03", revenue: 150 }]);

    // u1 booked the two paid orders; ties keep insertion order.
    expect(body.topCustomers[0]).toMatchObject({
      id: "u1",
      revenue: 150,
      requests: 2,
    });
    // Capped at the ten most recently updated requests.
    expect(body.recentActivity).toHaveLength(10);
    expect(body.recentActivity[0].title).toBe("Request #r2");
    expect(body.recentActivity[0].description).toBe(
      "Status changed to shipped"
    );
  });

  it("caps recent activity and top customers at ten", async () => {
    mocks.get.mockResolvedValue({
      docs: Array.from({ length: 12 }, (_, index) =>
        doc(`r${index}`, {
          status: "paid",
          userId: `u${index}`,
          payment: { amount: index },
          updatedAt: at(daysAgo(index)),
        })
      ),
    });

    const body = await (await GET(request())).json();

    expect(body.recentActivity).toHaveLength(10);
    expect(body.topCustomers).toHaveLength(10);
    expect(body.topCustomers[0].revenue).toBe(11);
  });

  it("reports a zero average when nothing has been paid", async () => {
    mocks.get.mockResolvedValue({
      docs: [
        doc("r1", { status: "submitted" }),
        doc("r2", { status: "review" }),
      ],
    });

    const body = await (await GET(request())).json();

    expect(body.financials.paidOrders).toBe(0);
    expect(body.financials.averageOrderValue).toBe(0);
    expect(body.monthlyRevenue).toEqual([]);
  });

  it("rejects an unauthenticated caller", async () => {
    mocks.requireAdmin.mockRejectedValue(new Error("AUTHENTICATION_REQUIRED"));

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
    await expect(response.json()).resolves.toMatchObject({
      error: "Unable to load analytics.",
    });
  });

  it("reads only the fields the dashboard aggregates", async () => {
    await GET(request());

    const fields = mocks.select.mock.calls[0][0] as string[];
    // The projections the numbers come from — and nothing else, so a refresh
    // does not drag whole documents (items, photos, addresses) off the wire.
    expect(fields).toEqual([
      "status",
      "userId",
      "customerName",
      "email",
      "payment.amount",
      "quote.breakdown.grandTotal",
      "quote.breakdown.serviceFee",
      "quote.breakdown.productsTotal",
      "quote.breakdown.domesticShipping",
      "quote.breakdown.internationalShipping",
      "createdAt",
      "updatedAt",
      "refundRequest.status",
      "quoteRegenerationRequested",
    ]);
  });

  it("serves repeated loads from the 60-second cache", async () => {
    vi.useFakeTimers();
    await GET(request());
    await GET(request());

    // One collection read for two dashboard loads.
    expect(mocks.get).toHaveBeenCalledTimes(1);

    // Past the TTL the next load reads again.
    vi.setSystemTime(Date.now() + 61_000);
    await GET(request());

    expect(mocks.get).toHaveBeenCalledTimes(2);
  });

  it("does not cache a failed load", async () => {
    mocks.get.mockRejectedValueOnce(new Error("firestore down"));

    const failed = await GET(request());
    expect(failed.status).toBe(500);

    const second = await GET(request());

    expect(second.status).toBe(200);
    expect(mocks.get).toHaveBeenCalledTimes(2);
  });
});
