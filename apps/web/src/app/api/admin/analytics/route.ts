import { NextRequest, NextResponse } from "next/server";

import { adminDb } from "@/lib/firebaseAdmin";
import { getAdminAuthError, requireAdmin } from "@/lib/adminAuth";

const NO_STORE = { "Cache-Control": "no-store" } as const;

/*
 * The dashboard is the most-refreshed admin screen and every refresh used to
 * read every request document. The numbers are operational, not financial
 * reporting: a 60-second server-side cache keeps repeated loads from
 * re-billing the whole collection without anyone noticing the staleness. A
 * mirror/aggregate document maintained on write would remove the cost
 * entirely; that is a bigger change than the dashboard needs today
 * (docs/AUDIT.md §2.3).
 */
const ANALYTICS_CACHE_TTL_MS = 60_000;

/**
 * The dashboard reads a bounded window rather than every request ever created.
 * Totals are therefore over this window; the response says when the cap was hit
 * so nobody reads a truncated number as the whole business.
 */
const ANALYTICS_MAX_REQUESTS = 10_000;
let analyticsCache: { at: number; body: unknown } | null = null;

interface RequestData {
  id: string;
  status?: string;
  userId?: string;
  customerName?: string;
  email?: string;
  payment?: { amount?: number };
  quote?: {
    breakdown?: {
      grandTotal?: number;
      serviceFee?: number;
      productsTotal?: number;
      domesticShipping?: number;
      internationalShipping?: number;
    };
  };
  createdAt?: { toDate?: () => Date };
  updatedAt?: { toDate?: () => Date };
  refundRequest?: { status?: string };
  quoteRegenerationRequested?: boolean;
}

/*
 * A request counts as revenue only once it is paid. `submitted`, `review`,
 * `awaiting_payment` and the terminal non-paying states are pipeline, not money;
 * counting their quoted totals inflated every financial number on the page.
 */
const PAID_STATUSES = new Set([
  "paid",
  "purchased",
  "warehouse_received",
  "ready_for_international_shipping",
  "packed",
  "shipped",
  "out_for_delivery",
  "delivered",
]);

/** Nothing here can still become overdue. */
const TERMINAL_STATUSES = new Set(["delivered", "refunded", "rejected"]);

function requestRevenue(request: RequestData): number {
  return request.payment?.amount ?? request.quote?.breakdown?.grandTotal ?? 0;
}

/** `YYYY-MM`, independent of locale and of the current year. */
function monthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(
    2,
    "0"
  )}`;
}

export const GET = async (request: NextRequest): Promise<NextResponse> => {
  try {
    await requireAdmin(request);
  } catch (error) {
    const authError = getAdminAuthError(error);
    return NextResponse.json(
      { success: false, error: authError.error },
      { status: authError.status, headers: NO_STORE }
    );
  }

  try {
    if (
      analyticsCache &&
      Date.now() - analyticsCache.at < ANALYTICS_CACHE_TTL_MS
    ) {
      return NextResponse.json(analyticsCache.body, {
        status: 200,
        headers: NO_STORE,
      });
    }

    const snapshot = await adminDb
      .collection("requests")
      .select(
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
        "quoteRegenerationRequested"
      )
      .limit(ANALYTICS_MAX_REQUESTS)
      .get();
    const requests = snapshot.docs.map(
      (doc) => ({ id: doc.id, ...doc.data() }) as RequestData
    );

    const review = requests.filter((r) => r.status === "review").length;
    const paidRequests = requests.filter((r) =>
      PAID_STATUSES.has(r.status ?? "")
    );

    /*
     * "Quote ready" is not "under review": it is the subset of reviewed
     * requests that actually carry a priced quote for the customer to approve.
     */
    const quoteReady = requests.filter(
      (r) => r.status === "review" && (r.quote?.breakdown?.grandTotal ?? 0) > 0
    ).length;

    let grossRevenue = 0;
    let serviceFees = 0;
    let productCost = 0;
    let shippingCost = 0;
    let paidOrders = 0;

    for (const request of paidRequests) {
      paidOrders += 1;
      const breakdown = request.quote?.breakdown;
      grossRevenue += breakdown?.grandTotal ?? 0;
      serviceFees += breakdown?.serviceFee ?? 0;
      productCost += breakdown?.productsTotal ?? 0;
      shippingCost +=
        (breakdown?.domesticShipping ?? 0) +
        (breakdown?.internationalShipping ?? 0);
    }

    const months: Record<string, number> = {};
    for (const request of paidRequests) {
      const created = request.createdAt?.toDate?.();
      if (!created) continue;
      const key = monthKey(created);
      months[key] = (months[key] ?? 0) + requestRevenue(request);
    }

    const customerMap = new Map<
      string,
      { name: string; email: string; revenue: number; requestCount: number }
    >();
    for (const request of paidRequests) {
      const id = request.userId || "unknown";
      const existing = customerMap.get(id) ?? {
        name: request.customerName || "Unknown",
        email: request.email || "-",
        revenue: 0,
        requestCount: 0,
      };
      customerMap.set(id, {
        ...existing,
        revenue: existing.revenue + requestRevenue(request),
        requestCount: existing.requestCount + 1,
      });
    }

    const today = new Date().toDateString();

    const stats = {
      totalRequests: requests.length,
      total: requests.length,
      submitted: requests.filter((r) => r.status === "submitted").length,
      review,
      quoteReady,
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
      revenue: paidRequests.reduce(
        (sum, request) => sum + requestRevenue(request),
        0
      ),
    };

    const operations = {
      awaitingQuote: review,
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
          r.updatedAt?.toDate?.().toDateString() === today
      ).length,
      overdue: requests.filter((r) => {
        if (!r.updatedAt || TERMINAL_STATUSES.has(r.status ?? "")) return false;
        const days =
          (Date.now() - (r.updatedAt.toDate?.()?.getTime() ?? 0)) / 86400000;
        return days > 14;
      }).length,
    };

    /* __PART_2__ */
    const recentActivity = [...requests]
      .sort((a, b) => {
        const aTime = a.updatedAt?.toDate?.()?.getTime() ?? 0;
        const bTime = b.updatedAt?.toDate?.()?.getTime() ?? 0;
        return bTime - aTime;
      })
      .slice(0, 10)
      .map((request) => ({
        id: request.id,
        title: `Request #${request.id.slice(0, 6)}`,
        description: `Status changed to ${request.status ?? "unknown"}`,
        createdAt: request.updatedAt?.toDate?.()?.toISOString(),
      }));

    const financials = {
      grossRevenue,
      serviceFees,
      productCost,
      shippingCost,
      paidOrders,
      // Money, not a float: 100 / 6 is not 16.666666666666668 on a dashboard.
      averageOrderValue:
        paidOrders === 0
          ? 0
          : Math.round((grossRevenue / paidOrders) * 100) / 100,
    };

    const body = {
      success: true,
      truncated: snapshot.size >= ANALYTICS_MAX_REQUESTS,
      stats,
      monthlyRevenue: Object.entries(months)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, revenue]) => ({ month, revenue })),
      statusDistribution: [
        { name: "Submitted", value: stats.submitted },
        { name: "Review", value: review },
        { name: "Awaiting Payment", value: stats.awaitingPayment },
        { name: "Warehouse", value: stats.warehouse },
        { name: "Shipped", value: stats.shipped },
        { name: "Delivered", value: stats.delivered },
      ],
      recentActivity,
      topCustomers: Array.from(customerMap.entries())
        .map(([id, data]) => ({
          id,
          name: data.name,
          email: data.email,
          revenue: data.revenue,
          requests: data.requestCount,
        }))
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 10),
      operations,
      financials,
    };

    analyticsCache = { at: Date.now(), body };

    return NextResponse.json(body, { status: 200, headers: NO_STORE });
  } catch (error) {
    console.error("[AdminAnalytics] Failed to load analytics:", error);
    return NextResponse.json(
      { success: false, error: "Unable to load analytics." },
      { status: 500, headers: NO_STORE }
    );
  }
};
