import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const customerApiMock = vi.fn();

vi.mock("@/lib/customerApiClient", () => ({
  customerApi: (...args: unknown[]) => customerApiMock(...args),
}));

import {
  getDashboardStats,
  getFinancialOverview,
  getMonthlyRevenue,
  getOperationsOverview,
  getRecentActivity,
  getStatusDistribution,
  getTopCustomers,
} from "./analytics";

const day = 86_400_000;

interface TestRequest extends Record<string, unknown> {
  id: string;
  status: string;
  userId?: string;
  customerName?: string;
  email?: string;
  payment?: { amount: number };
  quote?: { breakdown?: QuoteBreakdown };
  quoteRegenerationRequested?: boolean;
  refundRequest?: { status?: string };
  createdAt?: { toDate: () => Date };
  updatedAt?: { toMillis: () => number; toDate: () => Date };
}

interface QuoteBreakdown {
  grandTotal?: number;
  serviceFee?: number;
  productsTotal?: number;
  domesticShipping?: number;
  internationalShipping?: number;
}

const req = (overrides: Partial<TestRequest> = {}) =>
  ({
    id: "req-1",
    status: "submitted",
    ...overrides,
  }) as TestRequest;

const stamp = (ms: number) => ({
  toMillis: () => ms,
  toDate: () => new Date(ms),
});

/** Build the full AnalyticsApiResponse that /api/admin/analytics would return for these requests. */
function buildResponse(requests: TestRequest[]) {
  const reviewed = requests.filter((r) => r.status === "review").length;
  const paidStatuses = new Set([
    "paid",
    "purchased",
    "warehouse_received",
    "packed",
    "shipped",
    "delivered",
  ]);
  let grossRevenue = 0,
    serviceFees = 0,
    productCost = 0,
    shippingCost = 0,
    paidOrders = 0;
  const months: Record<string, number> = {};
  const customerMap = new Map<
    string,
    { name: string; email: string; revenue: number; count: number }
  >();

  for (const r of requests) {
    const rev = (r.payment?.amount ??
      r.quote?.breakdown?.grandTotal ??
      0) as number;
    if (paidStatuses.has(String(r.status ?? ""))) {
      paidOrders++;
      const bd = r.quote?.breakdown;
      grossRevenue += (bd?.grandTotal ?? 0) as number;
      serviceFees += (bd?.serviceFee ?? 0) as number;
      productCost += (bd?.productsTotal ?? 0) as number;
      shippingCost +=
        ((bd?.domesticShipping ?? 0) as number) +
        ((bd?.internationalShipping ?? 0) as number);
    }
    const createdAt = r.createdAt;
    if (createdAt) {
      const month = createdAt
        .toDate()
        .toLocaleString("default", { month: "short" });
      months[month] = (months[month] ?? 0) + rev;
    }
    const uid = String(r.userId ?? "unknown");
    const existing = customerMap.get(uid) ?? {
      name: String(r.customerName ?? "Unknown"),
      email: String(r.email ?? "-"),
      revenue: 0,
      count: 0,
    };
    customerMap.set(uid, {
      ...existing,
      revenue: existing.revenue + rev,
      count: existing.count + 1,
    });
  }

  const todayStr = new Date().toDateString();
  return {
    success: true,
    stats: {
      totalRequests: requests.length,
      total: requests.length,
      submitted: requests.filter((r) => r.status === "submitted").length,
      review: reviewed,
      quoteReady: reviewed,
      quoteUpdates: requests.filter(
        (r) =>
          r.quoteRegenerationRequested === true &&
          r.status !== "rejected" &&
          r.status !== "refunded"
      ).length,
      refundRequested: requests.filter(
        (r) => r.refundRequest?.status === "requested"
      ).length,
      awaitingPayment: requests.filter((r) => r.status === "awaiting_payment")
        .length,
      warehouse: requests.filter(
        (r) => r.status === "warehouse_received" || r.status === "packed"
      ).length,
      shipped: requests.filter((r) => r.status === "shipped").length,
      delivered: requests.filter((r) => r.status === "delivered").length,
      revenue: requests.reduce(
        (s, r) =>
          s +
          ((r.payment?.amount ??
            r.quote?.breakdown?.grandTotal ??
            0) as number),
        0
      ),
    },
    monthlyRevenue: Object.entries(months).map(([m, r]) => ({
      month: m,
      revenue: r,
    })),
    statusDistribution: [
      {
        name: "Submitted",
        value: requests.filter((r) => r.status === "submitted").length,
      },
      { name: "Review", value: reviewed },
      {
        name: "Awaiting Payment",
        value: requests.filter((r) => r.status === "awaiting_payment").length,
      },
      {
        name: "Warehouse",
        value: requests.filter(
          (r) => r.status === "warehouse_received" || r.status === "packed"
        ).length,
      },
      {
        name: "Shipped",
        value: requests.filter((r) => r.status === "shipped").length,
      },
      {
        name: "Delivered",
        value: requests.filter((r) => r.status === "delivered").length,
      },
    ],
    recentActivity: [...requests]
      .sort((a, b) => {
        const aT =
          (
            a.updatedAt as { toMillis?: () => number } | undefined
          )?.toMillis?.() ?? 0;
        const bT =
          (
            b.updatedAt as { toMillis?: () => number } | undefined
          )?.toMillis?.() ?? 0;
        return bT - aT;
      })
      .slice(0, 10)
      .map((r) => ({
        id: String(r.id),
        title: `Request #${String(r.id).slice(0, 6)}`,
        description: `Status changed to ${r.status}`,
        createdAt: (
          r.updatedAt as { toDate?: () => Date } | undefined
        )?.toDate?.(),
      })),
    topCustomers: Array.from(customerMap.entries())
      .map(([id, d]) => ({
        id,
        name: d.name,
        email: d.email,
        requests: d.count,
        revenue: d.revenue,
      }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10),
    operations: {
      awaitingQuote: reviewed,
      awaitingPayment: requests.filter((r) => r.status === "awaiting_payment")
        .length,
      warehouse: requests.filter(
        (r) => r.status === "warehouse_received" || r.status === "packed"
      ).length,
      readyToShip: requests.filter(
        (r) => r.status === "ready_for_international_shipping"
      ).length,
      shippedToday: requests.filter(
        (r) =>
          r.status === "shipped" &&
          (r.updatedAt as { toDate: () => Date } | undefined)
            ?.toDate?.()
            ?.toDateString() === todayStr
      ).length,
      overdue: requests.filter((r) => {
        if (!r.updatedAt || r.status === "delivered") return false;
        return (
          (Date.now() -
            (r.updatedAt as { toMillis: () => number }).toMillis()) /
            86400000 >
          14
        );
      }).length,
    },
    financials: {
      grossRevenue,
      serviceFees,
      productCost,
      shippingCost,
      paidOrders,
      averageOrderValue: paidOrders === 0 ? 0 : grossRevenue / paidOrders,
    },
  };
}

function seed(...requests: TestRequest[]) {
  customerApiMock.mockResolvedValue(buildResponse(requests));
}

beforeEach(() => {
  customerApiMock.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("getDashboardStats", () => {
  it("counts each operational bucket and totals revenue", async () => {
    seed(
      req({ id: "a", status: "submitted" }),
      req({ id: "b", status: "review" }),
      req({ id: "c", status: "review", quoteRegenerationRequested: true }),
      req({ id: "d", status: "awaiting_payment", payment: { amount: 120 } }),
      req({
        id: "e",
        status: "warehouse_received",
        quote: { breakdown: { grandTotal: 80 } },
      }),
      req({ id: "f", status: "packed" }),
      req({ id: "g", status: "shipped" }),
      req({
        id: "h",
        status: "delivered",
        refundRequest: { status: "requested" },
      }),
      req({ id: "i", status: "rejected", quoteRegenerationRequested: true })
    );

    await expect(getDashboardStats()).resolves.toEqual({
      totalRequests: 9,
      total: 9,
      submitted: 1,
      review: 2,
      quoteReady: 2,
      quoteUpdates: 1,
      refundRequested: 1,
      awaitingPayment: 1,
      warehouse: 2,
      shipped: 1,
      delivered: 1,
      revenue: 200,
    });
  });

  it("wraps read failures", async () => {
    customerApiMock.mockRejectedValue(new Error("offline"));

    await expect(getDashboardStats()).rejects.toBeInstanceOf(Error);
  });
});

describe("getMonthlyRevenue", () => {
  it("groups revenue by month name and skips untimed requests", async () => {
    const january = Date.UTC(2026, 0, 15);
    const february = Date.UTC(2026, 1, 10);
    const monthOf = (ms: number) =>
      new Date(ms).toLocaleString("default", { month: "short" });

    seed(
      req({ id: "a", createdAt: stamp(january), payment: { amount: 100 } }),
      req({ id: "b", createdAt: stamp(january), payment: { amount: 50 } }),
      req({
        id: "c",
        createdAt: stamp(february),
        quote: { breakdown: { grandTotal: 25 } },
      }),
      req({ id: "d" })
    );

    const points = await getMonthlyRevenue();

    expect(points).toEqual([
      { month: monthOf(january), revenue: 150 },
      { month: monthOf(february), revenue: 25 },
    ]);
  });

  it("wraps read failures", async () => {
    customerApiMock.mockRejectedValue(new Error("offline"));

    await expect(getMonthlyRevenue()).rejects.toBeInstanceOf(Error);
  });
});

describe("getStatusDistribution", () => {
  it("returns the fixed chart rows", async () => {
    seed(
      req({ id: "a", status: "submitted" }),
      req({ id: "b", status: "packed" }),
      req({ id: "c", status: "warehouse_received" }),
      req({ id: "d", status: "delivered" }),
      req({ id: "e", status: "delivered" })
    );

    await expect(getStatusDistribution()).resolves.toEqual([
      { name: "Submitted", value: 1 },
      { name: "Review", value: 0 },
      { name: "Awaiting Payment", value: 0 },
      { name: "Warehouse", value: 2 },
      { name: "Shipped", value: 0 },
      { name: "Delivered", value: 2 },
    ]);
  });

  it("wraps read failures", async () => {
    customerApiMock.mockRejectedValue(new Error("offline"));

    await expect(getStatusDistribution()).rejects.toBeInstanceOf(Error);
  });
});

describe("getRecentActivity", () => {
  it("lists the ten most recently updated requests", async () => {
    seed(
      ...Array.from({ length: 12 }, (_, index) =>
        req({
          id: `req-${index}`,
          status: "paid",
          updatedAt: stamp(index * day),
        })
      )
    );

    const activity = await getRecentActivity();

    expect(activity).toHaveLength(10);
    expect(activity[0].id).toBe("req-11");
    expect(activity[0].title).toBe("Request #req-11");
    expect(activity[0].description).toBe("Status changed to paid");
    expect(activity[0].createdAt).toEqual(new Date(11 * day));
  });

  it("leaves the timestamp undefined when the request was never updated", async () => {
    seed(req({ id: "fresh" }));

    const [entry] = await getRecentActivity();

    expect(entry.createdAt).toBeUndefined();
  });

  it("wraps read failures", async () => {
    customerApiMock.mockRejectedValue(new Error("offline"));

    await expect(getRecentActivity()).rejects.toBeInstanceOf(Error);
  });
});

describe("getTopCustomers", () => {
  it("aggregates spend per customer and sorts by revenue", async () => {
    seed(
      req({
        id: "a",
        userId: "u1",
        customerName: "Ada",
        email: "ada@x.com",
        payment: { amount: 50 },
      }),
      req({
        id: "b",
        userId: "u1",
        customerName: "Ada",
        email: "ada@x.com",
        payment: { amount: 25 },
      }),
      req({
        id: "c",
        userId: "u2",
        customerName: "Grace",
        email: "grace@x.com",
        payment: { amount: 200 },
      })
    );

    await expect(getTopCustomers()).resolves.toEqual([
      {
        id: "u2",
        name: "Grace",
        email: "grace@x.com",
        requests: 1,
        revenue: 200,
      },
      { id: "u1", name: "Ada", email: "ada@x.com", requests: 2, revenue: 75 },
    ]);
  });

  it("falls back for anonymous requests", async () => {
    seed(req({ id: "a" }));

    await expect(getTopCustomers()).resolves.toEqual([
      { id: "unknown", name: "Unknown", email: "-", requests: 1, revenue: 0 },
    ]);
  });

  it("wraps read failures", async () => {
    customerApiMock.mockRejectedValue(new Error("offline"));

    await expect(getTopCustomers()).rejects.toBeInstanceOf(Error);
  });
});

describe("getOperationsOverview", () => {
  it("counts today’s shipments and overdue work", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-01T12:00:00Z"));
    const now = Date.now();

    seed(
      req({ id: "a", status: "review" }),
      req({ id: "b", status: "awaiting_payment" }),
      req({ id: "c", status: "packed" }),
      req({ id: "d", status: "ready_for_international_shipping" }),
      req({ id: "e", status: "shipped", updatedAt: stamp(now) }),
      req({ id: "f", status: "shipped", updatedAt: stamp(now - 20 * day) }),
      req({ id: "g", status: "submitted", updatedAt: stamp(now - 20 * day) }),
      req({ id: "h", status: "delivered", updatedAt: stamp(now - 40 * day) }),
      req({ id: "i", status: "submitted" })
    );

    await expect(getOperationsOverview()).resolves.toEqual({
      awaitingQuote: 1,
      awaitingPayment: 1,
      warehouse: 1,
      readyToShip: 1,
      shippedToday: 1,
      overdue: 2,
    });

    vi.useRealTimers();
  });

  it("wraps read failures", async () => {
    customerApiMock.mockRejectedValue(new Error("offline"));

    await expect(getOperationsOverview()).rejects.toBeInstanceOf(Error);
  });
});

describe("getFinancialOverview", () => {
  it("sums the paid orders only", async () => {
    const breakdown = {
      grandTotal: 120,
      serviceFee: 10,
      productsTotal: 80,
      domesticShipping: 5,
      internationalShipping: 25,
    };

    seed(
      req({ id: "a", status: "delivered", quote: { breakdown } }),
      req({
        id: "b",
        status: "paid",
        quote: { breakdown: { ...breakdown, grandTotal: 80 } },
      }),
      req({ id: "c", status: "submitted", quote: { breakdown } }),
      req({ id: "d", status: "paid" })
    );

    await expect(getFinancialOverview()).resolves.toEqual({
      grossRevenue: 200,
      serviceFees: 20,
      productCost: 160,
      shippingCost: 60,
      paidOrders: 3,
      averageOrderValue: 200 / 3,
    });
  });

  it("avoids dividing by zero", async () => {
    seed(req({ id: "a", status: "review" }));

    await expect(getFinancialOverview()).resolves.toMatchObject({
      paidOrders: 0,
      averageOrderValue: 0,
    });
  });

  it("wraps read failures", async () => {
    customerApiMock.mockRejectedValue(new Error("offline"));

    await expect(getFinancialOverview()).rejects.toBeInstanceOf(Error);
  });
});
