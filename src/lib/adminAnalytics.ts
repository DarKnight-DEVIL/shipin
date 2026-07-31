import {
  collection,
  getDocs,
} from "firebase/firestore";

import { db } from "./firebase";

export async function getDashboardStats() {
  const snapshot = await getDocs(
    collection(db, "requests")
  );

  const requests = snapshot.docs.map((doc) => ({
    id: doc.id,
    ...(doc.data() as any),
  }));

  const revenue = requests.reduce(
    (sum, request) =>
      sum +
      (request.payment?.amount ??
        request.quote?.breakdown
          ?.grandTotal ??
        0),
    0
  );

  return {
    totalRequests: requests.length,

    submitted: requests.filter(
      (r) => r.status === "submitted"
    ).length,

    review: requests.filter(
      (r) => r.status === "review"
    ).length,

    awaitingPayment: requests.filter(
      (r) =>
        r.status ===
        "awaiting_payment"
    ).length,

    warehouse: requests.filter(
      (r) =>
        r.status ===
          "warehouse_received" ||
        r.status === "packed"
    ).length,

    shipped: requests.filter(
      (r) => r.status === "shipped"
    ).length,

    delivered: requests.filter(
      (r) => r.status === "delivered"
    ).length,

    revenue,
  };
}

export async function getMonthlyRevenue() {
  const snapshot = await getDocs(
    collection(db, "requests")
  );

  const requests = snapshot.docs.map((doc) => ({
    ...(doc.data() as any),
  }));

  const months: Record<
    string,
    number
  > = {};

  for (const request of requests) {
    if (!request.createdAt) continue;

    const date =
      request.createdAt.toDate();

    const month =
      date.toLocaleString(
        "default",
        {
          month: "short",
        }
      );

    months[month] =
      (months[month] || 0) +
      (
        request.payment?.amount ??
        request.quote?.breakdown
          ?.grandTotal ??
        0
      );
  }

  return Object.entries(months).map(
    ([month, revenue]) => ({
      month,
      revenue,
    })
  );
}

export async function getStatusDistribution() {
  const snapshot = await getDocs(
    collection(db, "requests")
  );

  const requests = snapshot.docs.map(
    (doc) => doc.data() as any
  );

  return [
    {
      name: "Submitted",
      value: requests.filter(
        (r) => r.status === "submitted"
      ).length,
    },
    {
      name: "Review",
      value: requests.filter(
        (r) => r.status === "review"
      ).length,
    },
    {
      name: "Awaiting Payment",
      value: requests.filter(
        (r) => r.status === "awaiting_payment"
      ).length,
    },
    {
      name: "Warehouse",
      value: requests.filter(
        (r) =>
          r.status ===
            "warehouse_received" ||
          r.status === "packed"
      ).length,
    },
    {
      name: "Shipped",
      value: requests.filter(
        (r) => r.status === "shipped"
      ).length,
    },
    {
      name: "Delivered",
      value: requests.filter(
        (r) => r.status === "delivered"
      ).length,
    },
  ];
}

export async function getRecentActivity() {
  const snapshot = await getDocs(
    collection(db, "requests")
  );

  const requests = snapshot.docs
    .map((doc) => ({
      id: doc.id,
      ...(doc.data() as any),
    }))
    .sort((a, b) => {
      const aTime =
        a.updatedAt?.toMillis?.() ?? 0;

      const bTime =
        b.updatedAt?.toMillis?.() ?? 0;

      return bTime - aTime;
    });

  return requests.slice(0, 10).map((request) => ({
    id: request.id,

    title: `Request #${request.id.slice(0, 6)}`,

    description: `Status changed to ${request.status}`,

    createdAt:
      request.updatedAt?.toDate?.(),
  }));
}

export async function getTopCustomers() {
  const snapshot = await getDocs(
    collection(db, "requests")
  );

  const customers: Record<string, any> = {};

  snapshot.docs.forEach((doc) => {
    const request = doc.data() as any;

    const id =
      request.userId ?? "unknown";

    if (!customers[id]) {
      customers[id] = {
        id,

        name:
          request.customerName ??
          "Unknown",

        email:
          request.email ?? "-",

        requests: 0,

        revenue: 0,
      };
    }

    customers[id].requests++;

    customers[id].revenue +=
      request.payment?.amount ??
      request.quote?.breakdown
        ?.grandTotal ??
      0;
  });

  return Object.values(customers)
    .sort(
      (a: any, b: any) =>
        b.revenue - a.revenue
    )
    .slice(0, 10);
}

export async function getOperationsOverview() {
  const snapshot = await getDocs(
    collection(db, "requests")
  );

  const requests = snapshot.docs.map(
    (d) => d.data() as any
  );

  const today = new Date().toDateString();

  return {
    awaitingQuote: requests.filter(
      (r) => r.status === "review"
    ).length,

    awaitingPayment: requests.filter(
      (r) => r.status === "awaiting_payment"
    ).length,

    warehouse: requests.filter(
      (r) =>
        r.status === "warehouse_received" ||
        r.status === "packed"
    ).length,

    readyToShip: requests.filter(
      (r) =>
        r.status ===
        "ready_for_international_shipping"
    ).length,

    shippedToday: requests.filter((r) => {
      if (
        r.status !== "shipped" ||
        !r.updatedAt
      )
        return false;

      return (
        r.updatedAt
          .toDate()
          .toDateString() === today
      );
    }).length,

    overdue: requests.filter((r) => {
      if (
        !r.updatedAt ||
        r.status === "delivered"
      )
        return false;

      const days =
        (Date.now() -
          r.updatedAt
            .toDate()
            .getTime()) /
        86400000;

      return days > 14;
    }).length,
  };
}

export async function getFinancialOverview() {
  const snapshot = await getDocs(
    collection(db, "requests")
  );

  const requests = snapshot.docs.map(
    (d) => d.data() as any
  );

  let grossRevenue = 0;
  let serviceFees = 0;
  let productCost = 0;
  let shippingCost = 0;
  let paidOrders = 0;

  for (const request of requests) {
    if (
      request.status !== "paid" &&
      request.status !== "purchased" &&
      request.status !== "warehouse_received" &&
      request.status !== "packed" &&
      request.status !== "shipped" &&
      request.status !== "delivered"
    ) {
      continue;
    }

    paidOrders++;

    const quote =
      request.quote?.breakdown ?? {};

    grossRevenue +=
      quote.grandTotal ?? 0;

    serviceFees +=
      quote.serviceFee ?? 0;

    productCost +=
      quote.productsTotal ?? 0;

    shippingCost +=
      (quote.domesticShipping ?? 0) +
      (quote.internationalShipping ?? 0);
  }

  return {
    grossRevenue,

    serviceFees,

    productCost,

    shippingCost,

    paidOrders,

    averageOrderValue:
      paidOrders === 0
        ? 0
        : grossRevenue / paidOrders,
  };
}