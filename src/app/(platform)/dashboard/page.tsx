"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  PackageOpen,
  Truck,
  Plus,
  AlertCircle,
  CreditCard,
  Package,
  CheckCircle2,
  MapPin,
  Bell,
  WalletCards,
  MessageCircle,
  ArrowRight,
  Activity,
  Clock,
} from "lucide-react";
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

  const recentRequests = requests.slice(0, 5);
  const latestShipment = requests.find(
    (request) => request.tracking?.internalTrackingId
  );

  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";
    return "Good evening";
  }, []);

  if (loading) {
    return (
      <div className="shipin-page w-full px-6 py-8 lg:px-10">
        <div className="space-y-8">
          <div className="space-y-3">
            <div className="h-4 w-32 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
            <div className="h-10 w-80 max-w-full animate-pulse rounded-xl bg-slate-200 dark:bg-slate-800" />
            <div className="h-5 w-96 max-w-full animate-pulse rounded-lg bg-slate-200 dark:bg-slate-800" />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="shipin-card h-36 animate-pulse" />
            ))}
          </div>
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
            {greeting}
          </p>
          <h1 className="text-3xl font-bold tracking-tight text-slate-950 dark:text-white sm:text-4xl">
            Welcome back, {userName}
          </h1>
          <p className="mt-2 max-w-xl text-slate-600 dark:text-slate-400">
            Track requests, payments, and shipments from one place.
          </p>
        </div>

        <Link
          href="/requests/new"
          className="shipin-btn-primary inline-flex items-center justify-center gap-2 px-5 py-3 text-sm"
        >
          <Plus size={18} />
          Create Request
        </Link>
      </div>

      {/* STATS */}
      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {visibleMetrics.map((metric, i) => (
          <motion.div
            key={metric.id}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05, duration: 0.4 }}
          >
            <StatCard
              id={metric.id}
              title={metric.label}
              value={metricValues[metric.id]}
              description={metric.description}
              highlight={
                metric.id === "awaiting_payment" &&
                metricValues[metric.id] > 0
              }
            />
          </motion.div>
        ))}
      </div>

      {/* ATTENTION REQUIRED */}
      {attentionRequired.length > 0 && (
        <section className="mb-8">
          <div className="mb-4 flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            <div>
              <h2 className="text-xl font-bold text-slate-950 dark:text-white">
                Needs your attention
              </h2>
              <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
                {attentionRequired.length} request
                {attentionRequired.length === 1 ? "" : "s"} waiting on you
              </p>
            </div>
          </div>

          <div className="space-y-3">
            {attentionRequired.slice(0, 4).map((request) => (
              <AttentionCard key={request.id} request={request} />
            ))}
          </div>
        </section>
      )}

      {/* MAIN GRID */}
      <div className="grid gap-6 xl:grid-cols-3">
        {/* RECENT REQUESTS */}
        <section className="xl:col-span-2">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold text-slate-950 dark:text-white">
                Recent requests
              </h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Your latest ShipIN activity
              </p>
            </div>

            <Link
              href="/requests"
              className="inline-flex items-center gap-1 text-sm font-medium text-purple-600 hover:text-purple-700 dark:text-purple-400 dark:hover:text-purple-300"
            >
              View all
              <ArrowRight size={14} />
            </Link>
          </div>

          <div className="shipin-card overflow-hidden">
            {recentRequests.length === 0 ? (
              <div className="flex min-h-[300px] items-center justify-center p-8">
                <div className="text-center">
                  <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-purple-500/10 text-purple-600 dark:text-purple-400">
                    <PackageOpen size={26} />
                  </div>
                  <h3 className="text-xl font-semibold text-slate-950 dark:text-white">
                    No requests yet
                  </h3>
                  <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-slate-500 dark:text-slate-400">
                    Create your first request to start shopping from India.
                  </p>
                  <button
                    type="button"
                    onClick={() => router.push("/requests/new")}
                    className="shipin-btn-primary mt-6 inline-flex items-center gap-2 px-5 py-3 text-sm"
                  >
                    <Plus size={16} />
                    Create Request
                  </button>
                </div>
              </div>
            ) : (
              recentRequests.map((request) => {
                const itemPreview = request.items
                  .slice(0, 2)
                  .map((item) => item.name)
                  .join(", ");
                const extra =
                  request.items.length > 2
                    ? ` +${request.items.length - 2} more`
                    : "";

                return (
                  <Link
                    key={request.id}
                    href={`/requests/${request.id}`}
                    className="flex items-center justify-between gap-4 border-b border-slate-200 px-5 py-4 transition hover:bg-slate-50 last:border-b-0 dark:border-slate-800 dark:hover:bg-slate-800/40 sm:px-6 sm:py-5"
                  >
                    <div className="flex min-w-0 items-start gap-3">
                      <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400">
                        <Package size={18} />
                      </div>
                      <div className="min-w-0">
                        <div className="font-semibold text-slate-950 dark:text-white">
                          Request #{request.id.slice(0, 6).toUpperCase()}
                        </div>
                        <p className="mt-0.5 truncate text-sm text-slate-500 dark:text-slate-400">
                          {itemPreview}
                          {extra}
                        </p>
                        <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                          {request.items.length}{" "}
                          {request.items.length === 1 ? "item" : "items"}
                          {request.createdAt && (
                            <>
                              {" · "}
                              {request.createdAt.toDate().toLocaleDateString()}
                            </>
                          )}
                        </p>
                      </div>
                    </div>

                    <div className="shrink-0 text-right">
                      <StatusLabel status={request.status} />
                    </div>
                  </Link>
                );
              })
            )}
          </div>
        </section>

        {/* RIGHT COLUMN */}
        <div className="space-y-6">
          {/* LATEST SHIPMENT */}
          <section>
            <h2 className="mb-4 text-xl font-bold text-slate-950 dark:text-white">
              Latest shipment
            </h2>

            {latestShipment ? (
              <div className="shipin-card p-6">
                <div className="mb-4 flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
                    <Truck size={20} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
                      ShipIN tracking
                    </p>
                    <p className="mt-0.5 truncate font-bold text-slate-950 dark:text-white">
                      {latestShipment.tracking?.internalTrackingId}
                    </p>
                  </div>
                </div>

                <StatusLabel status={latestShipment.status} />

                {latestShipment.tracking?.carrier && (
                  <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
                    Carrier:{" "}
                    <span className="font-medium text-slate-800 dark:text-slate-200">
                      {String(latestShipment.tracking.carrier)}
                    </span>
                  </p>
                )}

                {latestShipment.tracking?.estimatedDelivery && (
                  <div className="mt-4 flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900/50">
                    <Clock
                      size={16}
                      className="mt-0.5 shrink-0 text-slate-400"
                    />
                    <div>
                      <p className="text-xs text-slate-500">Estimated delivery</p>
                      <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
                        {latestShipment.tracking.estimatedDelivery}
                      </p>
                    </div>
                  </div>
                )}

                <Link
                  href={`/requests/${latestShipment.id}`}
                  className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 py-3 text-sm font-semibold text-slate-700 transition hover:border-purple-400 hover:text-purple-600 dark:border-slate-700 dark:text-slate-300 dark:hover:border-purple-500 dark:hover:text-purple-400"
                >
                  View shipment
                  <ArrowRight size={14} />
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
                      Tracking appears here once your order is dispatched.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </section>

          {/* QUICK ACTIONS */}
          <section>
            <h2 className="mb-4 text-xl font-bold text-slate-950 dark:text-white">
              Quick actions
            </h2>

            <div className="grid grid-cols-2 gap-3">
              <QuickActionTile
                href="/requests/new"
                title="New request"
                icon={<Plus size={18} />}
              />
              <QuickActionTile
                href="/requests"
                title="My requests"
                icon={<Package size={18} />}
              />
              <QuickActionTile
                href="/wallet"
                title="Wallet"
                icon={<WalletCards size={18} />}
              />
              <QuickActionTile
                href="/addresses"
                title="Addresses"
                icon={<MapPin size={18} />}
              />
              <QuickActionTile
                href="/notifications"
                title="Notifications"
                icon={<Bell size={18} />}
              />
              <QuickActionTile
                href="/support"
                title="Support"
                icon={<MessageCircle size={18} />}
              />
            </div>
          </section>
        </div>
      </div>
    </motion.div>
  );
}

/* =========================================
   METRIC HREF
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

function metricIcon(id: DashboardMetricId) {
  switch (id) {
    case "active":
      return <Activity size={18} />;
    case "awaiting_payment":
      return <CreditCard size={18} />;
    case "in_transit":
    case "shipped":
    case "out_for_delivery":
      return <Truck size={18} />;
    case "delivered":
      return <CheckCircle2 size={18} />;
    default:
      return <Package size={18} />;
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
      className={`group block shipin-card p-5 transition-all hover:shadow-md ${
        highlight
          ? "border-amber-300/80 bg-amber-50 dark:border-amber-500/30 dark:bg-amber-500/5"
          : ""
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
          {title}
        </p>
        <span
          className={`flex h-9 w-9 items-center justify-center rounded-xl ${
            highlight
              ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
              : "bg-purple-500/10 text-purple-600 dark:text-purple-400"
          }`}
        >
          {metricIcon(id)}
        </span>
      </div>

      <p
        className={`mt-3 text-4xl font-bold tracking-tight ${
          highlight
            ? "text-amber-600 dark:text-amber-400"
            : "text-slate-950 dark:text-white"
        }`}
      >
        {value}
      </p>

      <p className="mt-2 text-xs leading-5 text-slate-400 dark:text-slate-500">
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
  let cta = "Open";

  if (request.status === "review") {
    title = "Quote ready";
    description = "Review and approve your quote to continue.";
    cta = "Review quote";
  } else if (mainPayment) {
    title = "Payment required";
    description = "Your approved request is waiting for payment.";
    cta = "Pay now";
  } else if (additionalPayment) {
    title = "Additional item payment";
    description = "An approved extra item needs payment.";
    cta = "Pay now";
  }

  return (
    <Link
      href={`/requests/${request.id}`}
      className="flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 transition hover:border-amber-300 dark:border-amber-500/20 dark:bg-amber-500/5 dark:hover:border-amber-500/40 sm:flex-row sm:items-center sm:justify-between sm:p-5"
    >
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 text-amber-700 dark:text-amber-400">
          {mainPayment || additionalPayment ? (
            <CreditCard size={18} />
          ) : (
            <AlertCircle size={18} />
          )}
        </div>
        <div>
          <div className="font-semibold text-slate-950 dark:text-white">
            {title}
          </div>
          <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-400">
            Request #{request.id.slice(0, 6).toUpperCase()} · {description}
          </p>
        </div>
      </div>

      <span className="inline-flex shrink-0 items-center gap-1 self-start text-sm font-semibold text-amber-700 dark:text-amber-400 sm:self-center">
        {cta}
        <ArrowRight size={14} />
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
    rejected: "Rejected",
  };

  const styles: Record<string, string> = {
    submitted:
      "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
    review:
      "bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300",
    awaiting_payment:
      "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300",
    paid: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300",
    purchased:
      "bg-purple-50 text-purple-700 dark:bg-purple-500/10 dark:text-purple-300",
    warehouse_received:
      "bg-indigo-50 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300",
    ready_for_international_shipping:
      "bg-indigo-50 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300",
    packed:
      "bg-violet-50 text-violet-700 dark:bg-violet-500/10 dark:text-violet-300",
    shipped:
      "bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300",
    out_for_delivery:
      "bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300",
    delivered:
      "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300",
    refunded:
      "bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300",
    rejected:
      "bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300",
  };

  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
        styles[status] ??
        "bg-purple-50 text-purple-700 dark:bg-purple-500/10 dark:text-purple-300"
      }`}
    >
      {labels[status] ?? status}
    </span>
  );
}

/* =========================================
   QUICK ACTION TILE
========================================= */
function QuickActionTile({
  href,
  title,
  icon,
}: {
  href: string;
  title: string;
  icon: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="shipin-card flex flex-col items-start gap-3 p-4 transition hover:border-purple-400/40 hover:shadow-md"
    >
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400">
        {icon}
      </span>
      <span className="text-sm font-medium text-slate-900 dark:text-white">
        {title}
      </span>
    </Link>
  );
}