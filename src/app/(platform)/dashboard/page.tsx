"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PackageOpen, Truck } from "lucide-react";
import { motion } from "framer-motion";

import { auth } from "@/lib/firebase";
import { getRequests } from "@/lib/firestore";
import type { Request } from "@/types/request";

import {
  ACTIVE_REQUEST_STATUSES,
  DEFAULT_DASHBOARD_METRICS,
  IN_TRANSIT_STATUSES,
  dashboardMetrics,
  type DashboardMetricId,
} from "@/lib/dashboardMetrics";
import { getUserPreferences } from "@/lib/userPreferences";

export default function DashboardPage() {
  const router = useRouter();
  const [requests, setRequests] = useState<Request[]>([]);
  const [loading, setLoading] = useState(true);
  const [userName, setUserName] = useState("there");

  const [selectedMetrics, setSelectedMetrics] = useState<DashboardMetricId[]>(
    DEFAULT_DASHBOARD_METRICS
  );

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      if (!user) {
        setRequests([]);
        setLoading(false);
        return;
      }

      setUserName(
        user.displayName?.split(" ")[0] ||
          user.email?.split("@")[0] ||
          "there"
      );

      try {
        const [data, preferences] = await Promise.all([
          getRequests(user.uid),
          getUserPreferences(user.uid),
        ]);

        const sorted = [...data].sort((a, b) => {
          const aTime = a.createdAt?.seconds ?? 0;
          const bTime = b.createdAt?.seconds ?? 0;

          return bTime - aTime;
        });

        setRequests(sorted);
        setSelectedMetrics(preferences.dashboardMetrics);
      } catch (error) {
        console.error("Dashboard request loading failed:", error);
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  const metricValues = useMemo<Record<DashboardMetricId, number>>(() => {
    return {
      active: requests.filter((request) =>
        ACTIVE_REQUEST_STATUSES.includes(request.status)
      ).length,

      submitted: requests.filter((request) => request.status === "submitted")
        .length,

      quote_ready: requests.filter((request) => request.status === "review")
        .length,

      awaiting_payment: requests.filter((request) => {
        const mainPayment =
          request.status === "awaiting_payment" && !request.payment;

        const additionalPayment =
          request.additionalItemRequests?.some(
            (item) => item.status === "awaiting_payment"
          ) ?? false;

        return mainPayment || additionalPayment;
      }).length,

      paid: requests.filter((request) => request.status === "paid").length,

      purchased: requests.filter((request) => request.status === "purchased")
        .length,

      warehouse_received: requests.filter(
        (request) => request.status === "warehouse_received"
      ).length,

      ready_for_international_shipping: requests.filter(
        (request) => request.status === "ready_for_international_shipping"
      ).length,

      packed: requests.filter((request) => request.status === "packed").length,

      shipped: requests.filter((request) => request.status === "shipped")
        .length,

      in_transit: requests.filter((request) =>
        IN_TRANSIT_STATUSES.includes(request.status)
      ).length,

      out_for_delivery: requests.filter(
        (request) => request.status === "out_for_delivery"
      ).length,

      delivered: requests.filter((request) => request.status === "delivered")
        .length,

      refunded: requests.filter((request) => request.status === "refunded")
        .length,
    };
  }, [requests]);

  const visibleMetrics = selectedMetrics
    .map((metricId) =>
      dashboardMetrics.find((metric) => metric.id === metricId)
    )
    .filter(
      (metric): metric is (typeof dashboardMetrics)[number] => Boolean(metric)
    );

  /*
    Requests where the customer needs to do something.
  */
  const attentionRequired = useMemo(() => {
    return requests.filter((request) => {
      const quoteReady = request.status === "review";
      const paymentRequired =
        request.status === "awaiting_payment" && !request.payment;
      const additionalPaymentRequired =
        request.additionalItemRequests?.some(
          (item) => item.status === "awaiting_payment"
        ) ?? false;
      return quoteReady || paymentRequired || additionalPaymentRequired;
    });
  }, [requests]);

  const recentRequests = requests.slice(0, 4);
  const latestShipment = requests.find(
    (request) => request.tracking?.internalTrackingId
  );

  if (loading) {
    return (
      <div className="shipin-page w-full px-6 py-8 lg:px-10">
        <div className="space-y-8">
          {/* Header skeleton */}
          <div className="space-y-3">
            <div className="h-4 w-32 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
            <div className="h-10 w-80 animate-pulse rounded-xl bg-slate-200 dark:bg-slate-800" />
            <div className="h-5 w-96 max-w-full animate-pulse rounded-lg bg-slate-200 dark:bg-slate-800" />
          </div>

          {/* Stats skeleton */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <div
                key={index}
                className="shipin-card h-32 animate-pulse"
              />
            ))}
          </div>

          {/* Content skeleton */}
          <div className="grid gap-6 xl:grid-cols-3">
            <div className="shipin-card h-80 xl:col-span-2" />
            <div className="shipin-card h-80" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      className="shipin-page w-full px-6 py-8 lg:px-10"
    >
      {/* HEADER */}
      <div className="mb-8 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="mb-1 text-sm font-medium text-purple-600 dark:text-purple-400">
            ShipIN Dashboard
          </p>

          <h1 className="text-4xl font-bold text-slate-950 dark:text-white">
            Welcome back, {userName}
          </h1>

          <p className="mt-2 text-slate-600 dark:text-slate-400">
            Track your requests, payments and shipments from one place.
          </p>
        </div>

        <Link
          href="/requests/new"
          className="shipin-btn-primary inline-flex items-center justify-center px-5 py-3 text-sm"
        >
          + Create Request
        </Link>
      </div>

      {/* STATS */}
      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {visibleMetrics.map((metric) => (
          <StatCard
            key={metric.id}
            id={metric.id}
            title={metric.label}
            value={metricValues[metric.id]}
            description={metric.description}
            highlight={
              metric.id === "awaiting_payment" && metricValues[metric.id] > 0
            }
          />
        ))}
      </div>

      {/* ATTENTION REQUIRED */}
      {attentionRequired.length > 0 && (
        <section className="mb-8">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-slate-950 dark:text-white">
                Attention Required
              </h2>

              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                These requests need an action from you.
              </p>
            </div>
          </div>

          <div className="space-y-3">
            {attentionRequired.slice(0, 3).map((request) => (
              <AttentionCard key={request.id} request={request} />
            ))}
          </div>
        </section>
      )}

      {/* MAIN GRID */}
      <div className="grid gap-6 xl:grid-cols-3">
        {/* RECENT REQUESTS */}
        <section className="xl:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-slate-950 dark:text-white">
                Recent Requests
              </h2>

              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Your latest ShipIN requests.
              </p>
            </div>

            <Link
              href="/requests"
              className="text-sm font-medium text-purple-600 hover:text-purple-700 dark:text-purple-400 dark:hover:text-purple-300"
            >
              View all →
            </Link>
          </div>

          <div className="shipin-card overflow-hidden">
            {recentRequests.length === 0 ? (
              <div className="flex min-h-[320px] items-center justify-center p-8">
                <div className="text-center">
                  <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                    <PackageOpen size={26} />
                  </div>

                  <h3 className="text-xl font-semibold text-slate-950 dark:text-white">
                    No activity yet
                  </h3>

                  <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500 dark:text-slate-400">
                    Your requests and shipment activity will appear here once
                    you get started.
                  </p>

                  <button
                    type="button"
                    onClick={() => router.push("/requests/new")}
                    className="shipin-btn-primary mt-6 px-5 py-3 text-sm"
                  >
                    Create Request
                  </button>
                </div>
              </div>
            ) : (
              recentRequests.map((request) => (
                <Link
                  key={request.id}
                  href={`/requests/${request.id}`}
                  className="flex items-center justify-between gap-5 border-b border-slate-200 px-6 py-5 transition hover:bg-slate-50 last:border-b-0 dark:border-slate-800 dark:hover:bg-slate-800/50"
                >
                  <div className="min-w-0">
                    <div className="font-semibold text-slate-950 dark:text-white">
                      Request #{request.id.slice(0, 6)}
                    </div>

                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                      {request.items.length}{" "}
                      {request.items.length === 1 ? "item" : "items"}
                    </p>
                  </div>

                  <div className="text-right">
                    <StatusLabel status={request.status} />

                    {request.createdAt && (
                      <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">
                        {request.createdAt.toDate().toLocaleDateString()}
                      </p>
                    )}
                  </div>
                </Link>
              ))
            )}
          </div>
        </section>

        {/* RIGHT COLUMN */}
        <div className="space-y-6">
          {/* LATEST SHIPMENT */}
          <section>
            <h2 className="mb-4 text-xl font-bold text-slate-950 dark:text-white">
              Latest Shipment
            </h2>

            <div>
              {latestShipment ? (
                <div className="shipin-card p-6">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
                    ShipIN Tracking ID
                  </p>

                  <p className="mt-2 break-all text-lg font-bold text-slate-950 dark:text-white">
                    {latestShipment.tracking?.internalTrackingId}
                  </p>

                  <div className="mt-5">
                    <StatusLabel status={latestShipment.status} />
                  </div>

                  {latestShipment.tracking?.estimatedDelivery && (
                    <div className="mt-5 border-t border-slate-200 pt-4 dark:border-slate-800">
                      <p className="text-xs text-slate-500">
                        Estimated delivery
                      </p>

                      <p className="mt-1 font-medium text-slate-800 dark:text-slate-200">
                        {latestShipment.tracking.estimatedDelivery}
                      </p>
                    </div>
                  )}

                  <Link
                    href={`/requests/${latestShipment.id}`}
                    className="mt-6 block w-full rounded-xl border border-slate-200 py-3 text-center text-sm font-semibold text-slate-700 transition hover:border-purple-400 hover:text-purple-600 dark:border-slate-700 dark:text-slate-300 dark:hover:border-purple-500 dark:hover:text-purple-400"
                  >
                    View Shipment
                  </Link>
                </div>
              ) : (
                <div className="shipin-card border-dashed p-6">
                  <div className="flex items-start gap-4">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800">
                      <Truck
                        size={22}
                        className="text-slate-500 dark:text-slate-400"
                      />
                    </div>

                    <div className="min-w-0">
                      <h3 className="font-semibold text-slate-900 dark:text-white">
                        No active shipment
                      </h3>

                      <p className="mt-1 text-sm leading-6 text-slate-500 dark:text-slate-400">
                        Your shipment and tracking details will appear here once
                        your order has been dispatched.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* QUICK ACTIONS */}
          <section>
            <h2 className="mb-4 text-xl font-bold text-slate-950 dark:text-white">
              Quick Actions
            </h2>

            <div className="shipin-card overflow-hidden">
              <QuickAction
                href="/requests/new"
                title="Create Request"
                description="Shop something from India"
              />

              <QuickAction
                href="/requests"
                title="My Requests"
                description="Track your existing orders"
              />

              <QuickAction
                href="/addresses"
                title="Addresses"
                description="Manage delivery addresses"
              />

              <QuickAction
                href="/notifications"
                title="Notifications"
                description="View your latest updates"
                last
              />
            </div>
          </section>
        </div>
      </div>
    </motion.div>
  );
}

/* =========================================
METRIC HREF ROUTER
========================================= */
function getMetricHref(id: DashboardMetricId): string {
  switch (id) {
    case "active":
      return "/requests";
    case "submitted":
      return "/requests?status=submitted";
    case "quote_ready":
      return "/requests?status=review";
    case "awaiting_payment":
      return "/requests?status=awaiting_payment";
    case "paid":
      return "/requests?status=paid";
    case "purchased":
      return "/requests?status=purchased";
    case "warehouse_received":
      return "/requests?status=warehouse_received";
    case "ready_for_international_shipping":
      return "/requests?status=ready_for_international_shipping";
    case "packed":
      return "/requests?status=packed";
    case "shipped":
      return "/requests?status=shipped";
    case "in_transit":
      return "/requests?status=in_transit";
    case "out_for_delivery":
      return "/requests?status=out_for_delivery";
    case "delivered":
      return "/requests?status=delivered";
    case "refunded":
      return "/requests?status=refunded";
    default:
      return "/requests";
  }
}

/* =========================================
STAT CARD
========================================= */
function StatCard({
  id,
  title,
  value,
  description,
  highlight = false,
}: {
  id: DashboardMetricId;
  title: string;
  value: number;
  description: string;
  highlight?: boolean;
}) {
  return (
    <Link
      href={getMetricHref(id)}
      className={`block shipin-card p-5 transition-all hover:shadow-md ${
        highlight
          ? "border-amber-300/80 bg-amber-50 dark:border-amber-500/30 dark:bg-amber-500/5"
          : ""
      }`}
    >
      <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
        {title}
      </p>

      <p
        className={`mt-3 text-4xl font-bold ${
          highlight
            ? "text-amber-600 dark:text-amber-400"
            : "text-slate-950 dark:text-white"
        }`}
      >
        {value}
      </p>

      <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">
        {description}
      </p>
    </Link>
  );
}

/* =========================================
ATTENTION CARD
========================================= */
function AttentionCard({ request }: { request: Request }) {
  const mainPayment =
    request.status === "awaiting_payment" && !request.payment;
  const additionalPayment = request.additionalItemRequests?.some(
    (item) => item.status === "awaiting_payment"
  );
  let title = "Action required";
  let description = "Open this request to continue.";
  
  if (request.status === "review") {
    title = "Quote ready for approval";
    description = "Your ShipIN quote is ready. Review and approve it to continue.";
  } else if (mainPayment) {
    title = "Payment required";
    description = "Your approved request is waiting for payment.";
  } else if (additionalPayment) {
    title = "Additional item payment required";
    description = "An approved additional item is waiting for payment.";
  }
  
  return (
    <Link
      href={`/requests/${request.id}`}
      className="flex flex-col gap-4 rounded-2xl border border-amber-200 bg-amber-50 p-5 transition hover:border-amber-300 dark:border-amber-500/20 dark:bg-amber-500/5 dark:hover:border-amber-500/40 sm:flex-row sm:items-center sm:justify-between"
    >
      <div>
        <div className="font-semibold text-slate-950 dark:text-white">
          {title}
        </div>

        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Request #{request.id.slice(0, 6)} · {description}
        </p>
      </div>

      <span className="shrink-0 text-sm font-semibold text-amber-700 dark:text-amber-400">
        Review →
      </span>
    </Link>
  );
}

/* =========================================
STATUS
========================================= */
function StatusLabel({ status }: { status: string }) {
  const labels: Record<string, string> = {
    submitted: "Submitted",
    review: "Quote Ready",
    awaiting_payment: "Awaiting Payment",
    paid: "Paid",
    purchased: "Purchased",
    warehouse_received: "At Warehouse",
    ready_for_international_shipping: "Ready to Ship",
    packed: "Packed",
    shipped: "Shipped",
    out_for_delivery: "Out for Delivery",
    delivered: "Delivered",
    refunded: "Refunded",
  };
  return (
    <span className="inline-flex rounded-full bg-purple-50 px-3 py-1 text-xs font-semibold text-purple-700 dark:bg-purple-500/10 dark:text-purple-300">
      {labels[status] ?? status}
    </span>
  );
}

/* =========================================
QUICK ACTION
========================================= */
function QuickAction({
  href,
  title,
  description,
  last = false,
}: {
  href: string;
  title: string;
  description: string;
  last?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`block px-5 py-4 transition hover:bg-slate-50 dark:hover:bg-slate-800/50 ${
        !last ? "border-b border-slate-200 dark:border-slate-800" : ""
      }`}
    >
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="font-medium text-slate-900 dark:text-white">{title}</p>

          <p className="mt-1 text-xs text-slate-500">{description}</p>
        </div>

        <span className="text-slate-400">→</span>
      </div>
    </Link>
  );
}