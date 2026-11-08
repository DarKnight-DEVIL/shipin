import { collection, getDocs } from "firebase/firestore";

import { db } from "@/lib/firebase";
import { toShipINError } from "@/utils/errors";
import type { Request } from "@/types/request";

interface CustomerSummary {
  id: string;
  name: string;
  email: string;
  requests: number;
  revenue: number;
}

function requestRevenue(request: Request): number {
  return (
    request.payment?.amount ?? request.quote?.breakdown?.grandTotal ?? 0
  );
}

async function loadRequests(): Promise<Request[]> {
  const snapshot = await getDocs(collection(db, "requests"));
  return snapshot.docs.map((document) => ({
    id: document.id,
    ...(document.data() as Omit<Request, "id">),
  }));
}

export async function getDashboardStats() {
  try {
    const requests = await loadRequests();
    const revenue = requests.reduce(
      (sum, request) => sum + requestRevenue(request),
      0
    );
    const review = requests.filter((r) => r.status === "review").length;

    return {
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
      awaitingPayment: requests.filter(
        (r) => r.status === "awaiting_payment"
      ).length,
      warehouse: requests.filter(
        (r) => r.status === "warehouse_received" || r.status === "packed"
      ).length,
      shipped: requests.filter((r) => r.status === "shipped").length,
      delivered: requests.filter((r) => r.status === "delivered").length,
      revenue,
    };
  } catch (error) {
    throw toShipINError(error);
  }
}

export async function getMonthlyRevenue() {
  try {
    const requests = await loadRequests();
    const months: Record<string, number> = {};

    for (const request of requests) {
      if (!request.createdAt) continue;

      const month = request.createdAt.toDate().toLocaleString("default", {
        month: "short",
      });

      months[month] = (months[month] || 0) + requestRevenue(request);
    }

    return Object.entries(months).map(([month, revenue]) => ({
      month,
      revenue,
    }));
  } catch (error) {
    throw toShipINError(error);
  }
}

export async function getStatusDistribution() {
  try {
    const requests = await loadRequests();

    return [
      {
        name: "Submitted",
        value: requests.filter((r) => r.status === "submitted").length,
      },
      {
        name: "Review",
        value: requests.filter((r) => r.status === "review").length,
      },
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
    ];
  } catch (error) {
    throw toShipINError(error);
  }
}

export async function getRecentActivity() {
  try {
    const requests = (await loadRequests()).sort((a, b) => {
      const aTime = a.updatedAt?.toMillis?.() ?? 0;
      const bTime = b.updatedAt?.toMillis?.() ?? 0;
      return bTime - aTime;
    });

    return requests.slice(0, 10).map((request) => ({
      id: request.id,
      title: `Request #${request.id.slice(0, 6)}`,
      description: `Status changed to ${request.status}`,
      createdAt: request.updatedAt?.toDate?.(),
    }));
  } catch (error) {
    throw toShipINError(error);
  }
}

export async function getTopCustomers(): Promise<CustomerSummary[]> {
  try {
    const requests = await loadRequests();
    const customers: Record<string, CustomerSummary> = {};

    for (const request of requests) {
      const id = request.userId || "unknown";

      if (!customers[id]) {
        customers[id] = {
          id,
          name: request.customerName || "Unknown",
          email: request.email || "-",
          requests: 0,
          revenue: 0,
        };
      }

      customers[id].requests += 1;
      customers[id].revenue += requestRevenue(request);
    }

    return Object.values(customers)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);
  } catch (error) {
    throw toShipINError(error);
  }
}

export async function getOperationsOverview() {
  try {
    const requests = await loadRequests();
    const today = new Date().toDateString();

    return {
      awaitingQuote: requests.filter((r) => r.status === "review").length,
      awaitingPayment: requests.filter(
        (r) => r.status === "awaiting_payment"
      ).length,
      warehouse: requests.filter(
        (r) => r.status === "warehouse_received" || r.status === "packed"
      ).length,
      readyToShip: requests.filter(
        (r) => r.status === "ready_for_international_shipping"
      ).length,
      shippedToday: requests.filter(
        (r) =>
          r.status === "shipped" &&
          r.updatedAt?.toDate().toDateString() === today
      ).length,
      overdue: requests.filter((r) => {
        if (!r.updatedAt || r.status === "delivered") return false;
        const days = (Date.now() - r.updatedAt.toDate().getTime()) / 86400000;
        return days > 14;
      }).length,
    };
  } catch (error) {
    throw toShipINError(error);
  }
}

export async function getFinancialOverview() {
  try {
    const requests = await loadRequests();
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
      if (!paidStatuses.has(request.status)) continue;

      paidOrders += 1;
      const quote = request.quote?.breakdown;

      grossRevenue += quote?.grandTotal ?? 0;
      serviceFees += quote?.serviceFee ?? 0;
      productCost += quote?.productsTotal ?? 0;
      shippingCost +=
        (quote?.domesticShipping ?? 0) + (quote?.internationalShipping ?? 0);
    }

    return {
      grossRevenue,
      serviceFees,
      productCost,
      shippingCost,
      paidOrders,
      averageOrderValue: paidOrders === 0 ? 0 : grossRevenue / paidOrders,
    };
  } catch (error) {
    throw toShipINError(error);
  }
}
