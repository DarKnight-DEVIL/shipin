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

function requestRevenue(request: RequestData): number {
  return request.payment?.amount ?? request.quote?.breakdown?.grandTotal ?? 0;
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
      .get();
    const requests = snapshot.docs.map(
      (doc) => ({ id: doc.id, ...doc.data() }) as RequestData
    );

    const review = requests.filter((r) => r.status === "review").length;
    const paidStatuses = new Set([
      "paid",
      "purchased",
      "warehouse_received",
      "packed",
      "shipped",
      "delivered",
    ]);

    let grossRevenue = 0;
    let serviceFees = 0;
    let productCost = 0;
    let shippingCost = 0;
    let paidOrders = 0;

    for (const request of requests) {
      if (!paidStatuses.has(request.status ?? "")) continue;
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
    for (const request of requests) {
      const created = request.createdAt?.toDate?.();
      if (!created) continue;
      const month = created.toLocaleString("default", { month: "short" });
      months[month] = (months[month] ?? 0) + requestRevenue(request);
    }

    const customerMap = new Map<
      string,
      { name: string; email: string; revenue: number; requestCount: number }
    >();
    for (const request of requests) {
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
      quoteReady: review,
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
        if (!r.updatedAt || r.status === "delivered") return false;
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
      averageOrderValue: paidOrders === 0 ? 0 : grossRevenue / paidOrders,
    };

    const body = {
      success: true,
      stats,
      monthlyRevenue: Object.entries(months).map(([month, revenue]) => ({
        month,
        revenue,
      })),
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
