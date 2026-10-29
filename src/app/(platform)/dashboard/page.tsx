"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import {
  Activity,
  AlertCircle,
  ArrowRight,
  ArrowUpRight,
  Boxes,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  CreditCard,
  FileText,
  MapPin,
  MessageCircle,
  Package,
  PackageOpen,
  Plane,
  Plus,
  Send,
  ShoppingBag,
  Truck,
  Undo2,
  Wallet,
  type LucideIcon,
} from "lucide-react";

import { auth } from "@/lib/firebase";
import { getRequests } from "@/lib/firestore";
import type { Request } from "@/types/request";
import type { RequestStatus } from "@/lib/requestStatus";

import {
  ACTIVE_REQUEST_STATUSES,
  DEFAULT_DASHBOARD_METRICS,
  IN_TRANSIT_STATUSES,
  dashboardMetrics,
  type DashboardMetricId,
} from "@/lib/dashboardMetrics";
import { getUserPreferences } from "@/lib/userPreferences";

import StatusBadge from "@/components/ui/StatusBadge";

/* =========================================
   COUNT-UP HOOK
   Animates a number from 0 → target on mount.
========================================= */
function useCountUp(target: number, duration = 650) {
  const [value, setValue] = useState(0);
  const raf = useRef<number>(0);

  useEffect(() => {
    if (target === 0) { setValue(0); return; }
    // Respect reduced-motion preference
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setValue(target);
      return;
    }
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      const ease = t === 1 ? 1 : 1 - Math.pow(2, -10 * t); // expo out
      setValue(Math.round(ease * target));
      if (t < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [target, duration]);

  return value;
}

export default function DashboardPage() {
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
      active: requests.filter((r) =>
        ACTIVE_REQUEST_STATUSES.includes(r.status)
      ).length,
      submitted: requests.filter((r) => r.status === "submitted").length,
      quote_ready: requests.filter((r) => r.status === "review").length,
      awaiting_payment: requests.filter((r) => {
        const main  = r.status === "awaiting_payment" && !r.payment;
        const extra = r.additionalItemRequests?.some(
          (i) => i.status === "awaiting_payment"
        ) ?? false;
        return main || extra;
      }).length,
      paid:             requests.filter((r) => r.status === "paid").length,
      purchased:        requests.filter((r) => r.status === "purchased").length,
      warehouse_received: requests.filter(
        (r) => r.status === "warehouse_received"
      ).length,
      ready_for_international_shipping: requests.filter(
        (r) => r.status === "ready_for_international_shipping"
      ).length,
      packed:           requests.filter((r) => r.status === "packed").length,
      shipped:          requests.filter((r) => r.status === "shipped").length,
      in_transit:       requests.filter((r) =>
        IN_TRANSIT_STATUSES.includes(r.status)
      ).length,
      out_for_delivery: requests.filter(
        (r) => r.status === "out_for_delivery"
      ).length,
      delivered: requests.filter((r) => r.status === "delivered").length,
      refunded:  requests.filter((r) => r.status === "refunded").length,
    };
  }, [requests]);

  const visibleMetrics = selectedMetrics
    .map((id) => dashboardMetrics.find((m) => m.id === id))
    .filter((m): m is (typeof dashboardMetrics)[number] => Boolean(m));

  const attentionRequired = useMemo(() => {
    return requests.filter((r) => {
      const quoteReady        = r.status === "review";
      const paymentRequired   = r.status === "awaiting_payment" && !r.payment;
      const additionalPayment = r.additionalItemRequests?.some(
        (i) => i.status === "awaiting_payment"
      ) ?? false;
      return quoteReady || paymentRequired || additionalPayment;
    });
  }, [requests]);

  const recentRequests  = requests.slice(0, 5);
  const latestShipment  = requests.find((r) => r.tracking?.internalTrackingId);

  const greeting = useMemo(() => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 17) return "Good afternoon";
    return "Good evening";
  }, []);

  const today = useMemo(
    () =>
      new Date().toLocaleDateString(undefined, {
        weekday: "long",
        day: "numeric",
        month: "long",
      }),
    []
  );

  const statusLine = useMemo(() => {
    if (requests.length === 0)
      return "Your requests, payments and shipments will appear here.";
    const facts: string[] = [];
    if (metricValues.in_transit > 0)
      facts.push(`${metricValues.in_transit} in transit`);
    if (attentionRequired.length > 0)
      facts.push(
        `${attentionRequired.length} ${attentionRequired.length === 1 ? "needs" : "need"} your input`
      );
    if (metricValues.delivered > 0)
      facts.push(`${metricValues.delivered} delivered`);
    if (facts.length === 0)
      facts.push(
        `${requests.length} request${requests.length === 1 ? "" : "s"} so far`
      );
    return facts.join(" · ");
  }, [requests.length, metricValues, attentionRequired.length]);

  if (loading) {
    return (
      <div className="app-page">
        <div className="space-y-7">
          <div className="space-y-2.5">
            <div className="h-3 w-32 animate-pulse rounded bg-[var(--surface-3)]" />
            <div className="h-9 w-72 max-w-full animate-pulse rounded bg-[var(--surface-3)]" />
          </div>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="dash-card h-[140px] animate-pulse" />
            ))}
          </div>
          <div className="grid gap-6 xl:grid-cols-3">
            <div className="dash-card h-96 animate-pulse xl:col-span-2" />
            <div className="dash-card h-80 animate-pulse" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-page">

      {/* ── HEADER ─────────────────────────────────────── */}
      <header
        className="dash-in mb-7 flex flex-wrap items-end justify-between gap-4"
        style={{ "--i": 0 } as CSSProperties}
      >
        <div className="min-w-0">
          <p className="app-kicker">{today}</p>
          <h1 className="dash-title mt-1.5">
            {greeting},{" "}
            <span className="text-[var(--accent)]">{userName}</span>
          </h1>
          <p className="mt-1.5 text-[13px] text-[var(--muted)]">{statusLine}</p>
        </div>

        {/* Letter-roll primary CTA */}
        <Link href="/requests/new" className="app-btn app-btn-primary app-btn-lg">
          <Plus size={15} strokeWidth={2.5} aria-hidden="true" />
          <span className="roll">
            <span>New request</span>
            <span aria-hidden="true">New request</span>
          </span>
        </Link>
      </header>

      {/* ── NEEDS ATTENTION ────────────────────────────── */}
      {attentionRequired.length > 0 && (
        <section
          className="dash-in dash-attention"
          style={{ "--i": 1 } as CSSProperties}
        >
          {/* Left accent rail */}
          <span className="dash-attention-rail" />

          <div className="flex items-center gap-2.5 px-5 py-3">
            {/* Pulsing live dot */}
            <span className="relative flex h-2 w-2 shrink-0" aria-hidden="true">
              <span className="dash-pulse absolute inline-flex h-full w-full rounded-full bg-[var(--accent-solid)] opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--accent-solid)]" />
            </span>
            <h2 className="app-kicker text-[var(--accent)]">
              Needs your attention
            </h2>
            <span className="ml-auto text-[11px] font-medium tabular-nums text-[var(--accent)] opacity-80">
              {attentionRequired.length} waiting
            </span>
          </div>

          <div className="dash-attention-divide divide-y border-t">
            {attentionRequired.slice(0, 4).map((r) => (
              <AttentionRow key={r.id} request={r} />
            ))}
          </div>
        </section>
      )}

      {/* ── METRICS ────────────────────────────────────── */}
      <div className="mb-7 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {visibleMetrics.map((metric, i) => (
          <MetricCard
            key={metric.id}
            index={i + 2}
            id={metric.id}
            label={metric.label}
            description={metric.description}
            value={metricValues[metric.id]}
            highlight={
              metric.id === "awaiting_payment" && metricValues[metric.id] > 0
            }
          />
        ))}
      </div>

      {/* ── MAIN GRID ──────────────────────────────────── */}
      <div className="grid gap-6 lg:grid-cols-3">

        {/* Recent requests */}
        <section
          className="dash-in min-w-0 lg:col-span-2"
          style={{ "--i": 6 } as CSSProperties}
        >
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h2 className="app-section-title">Recent requests</h2>
            <Link
              href="/requests"
              className="group -mr-2.5 inline-flex items-center gap-1 px-2.5 py-2 text-[12px] font-medium text-[var(--muted)] transition-colors hover:text-[var(--accent)]"
            >
              All requests
              <ArrowRight size={12} className="dash-arrow" />
            </Link>
          </div>

          <div className="dash-card overflow-hidden">
            {recentRequests.length === 0 ? (
              <div className="px-6 py-16 text-center">
                <span className="dash-chip mx-auto h-11 w-11 rounded-xl">
                  <PackageOpen size={20} />
                </span>
                <h3 className="mt-4 text-[14px] font-semibold text-[var(--foreground)]">
                  No requests yet
                </h3>
                <p className="mx-auto mt-1.5 max-w-xs text-[12.5px] leading-5 text-[var(--muted)]">
                  Create a request with a product link and track it from quote
                  to doorstep.
                </p>
                <Link href="/requests/new" className="app-btn app-btn-primary mt-5">
                  <Plus size={14} strokeWidth={2.5} />
                  New request
                </Link>
              </div>
            ) : (
              <>
                <div className="hidden bg-[var(--surface-2)] px-5 py-2.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--muted-soft)] sm:flex sm:items-center sm:gap-4">
                  <span className="flex-1 pl-[52px]">Request</span>
                  <span className="w-16 text-right">Created</span>
                  <span className="w-[124px] text-right">Status</span>
                  <span className="w-3.5" />
                </div>
                <div className="border-t border-[var(--border)]">
                  {recentRequests.map((r) => (
                    <RequestRow key={r.id} request={r} />
                  ))}
                </div>
              </>
            )}
          </div>
        </section>

        {/* Right column */}
        <div
          className="dash-in min-w-0 space-y-6"
          style={{ "--i": 7 } as CSSProperties}
        >
          <section>
            <h2 className="app-section-title mb-3">Latest shipment</h2>
            {latestShipment ? (
              <ShipmentCard request={latestShipment} />
            ) : (
              <div className="dash-card border-dashed px-5 py-6">
                <div className="flex items-start gap-3">
                  <span className="dash-chip">
                    <Truck size={16} />
                  </span>
                  <div>
                    <p className="text-[13px] font-medium text-[var(--foreground)]">
                      Nothing in transit
                    </p>
                    <p className="mt-0.5 text-[12px] leading-5 text-[var(--muted)]">
                      Tracking appears here once a request ships.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </section>

          <section>
            <h2 className="app-section-title mb-3">Shortcuts</h2>
            <div className="dash-card p-1.5">
              {SHORTCUTS.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="group flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-[var(--surface-2)]"
                >
                  <span className="dash-chip">
                    <item.icon size={16} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-medium text-[var(--foreground)]">
                      {item.label}
                    </span>
                    <span className="block truncate text-[11.5px] text-[var(--muted)]">
                      {item.description}
                    </span>
                  </span>
                  <ChevronRight
                    size={14}
                    className="dash-arrow shrink-0 text-[var(--muted-soft)]"
                  />
                </Link>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

const SHORTCUTS: {
  href: string;
  label: string;
  description: string;
  icon: LucideIcon;
}[] = [
  { href: "/requests/new", label: "New request",  description: "Start with a product link",                     icon: Plus          },
  { href: "/wallet",       label: "Wallet",        description: "Funds and payments",                            icon: Wallet        },
  { href: "/addresses",    label: "Addresses",     description: "Where we deliver",                              icon: MapPin        },
  { href: "/support",      label: "Support",       description: "Questions about a quote, payment or delivery",  icon: MessageCircle },
];

/* =========================================
   METRIC HREF
========================================= */
function getMetricHref(id: DashboardMetricId): string {
  switch (id) {
    case "active":                           return "/requests";
    case "submitted":                        return "/requests?status=submitted";
    case "quote_ready":                      return "/requests?status=review";
    case "awaiting_payment":                 return "/requests?status=awaiting_payment";
    case "paid":                             return "/requests?status=paid";
    case "purchased":                        return "/requests?status=purchased";
    case "warehouse_received":               return "/requests?status=warehouse_received";
    case "ready_for_international_shipping": return "/requests?status=ready_for_international_shipping";
    case "packed":                           return "/requests?status=packed";
    case "shipped":                          return "/requests?status=shipped";
    case "in_transit":                       return "/requests?status=in_transit";
    case "out_for_delivery":                 return "/requests?status=out_for_delivery";
    case "delivered":                        return "/requests?status=delivered";
    case "refunded":                         return "/requests?status=refunded";
    default:                                 return "/requests";
  }
}

const METRIC_ICONS: Partial<Record<DashboardMetricId, LucideIcon>> = {
  active:                           Activity,
  submitted:                        ClipboardList,
  quote_ready:                      FileText,
  awaiting_payment:                 CreditCard,
  paid:                             CheckCircle2,
  purchased:                        ShoppingBag,
  warehouse_received:               Boxes,
  ready_for_international_shipping: Package,
  packed:                           Package,
  shipped:                          Send,
  in_transit:                       Plane,
  out_for_delivery:                 Truck,
  delivered:                        CheckCircle2,
  refunded:                         Undo2,
};

/* =========================================
   METRIC CARD  (with count-up animation)
========================================= */
function MetricCard({
  id,
  label,
  value,
  description,
  highlight = false,
  index,
}: {
  id: DashboardMetricId;
  label: string;
  value: number;
  description: string;
  highlight?: boolean;
  index: number;
}) {
  const Icon     = METRIC_ICONS[id] ?? Activity;
  const animated = useCountUp(value, 700);

  return (
    <Link
      href={getMetricHref(id)}
      aria-label={`${value} ${label}`}
      className={`dash-card dash-in group block p-4 sm:p-5 ${
        highlight ? "dash-stat--hot" : ""
      }`}
      style={{ "--i": index } as CSSProperties}
    >
      <div className="flex items-center justify-between">
        <span className="dash-chip">
          <Icon size={16} />
        </span>
        <ArrowUpRight
          size={14}
          aria-hidden="true"
          className="text-[var(--muted-soft)] opacity-0 transition-opacity group-hover:opacity-100"
        />
      </div>

      <p
        className={`dash-num mt-4 ${
          highlight ? "text-[var(--accent)]" : "text-[var(--foreground)]"
        }`}
      >
        {animated}
      </p>
      <p className="mt-1.5 text-[12.5px] font-medium text-[var(--foreground)]">
        {label}
      </p>
      <p className="mt-0.5 line-clamp-1 text-[11px] text-[var(--muted)]">
        {description}
      </p>
    </Link>
  );
}

/* =========================================
   REQUEST ROW
========================================= */
function RequestRow({ request }: { request: Request }) {
  const preview = request.items
    .slice(0, 2)
    .map((item) => item.name)
    .join(", ");
  const extra   = request.items.length > 2 ? ` +${request.items.length - 2}` : "";
  const initial = (preview.trim().charAt(0) || "#").toUpperCase();

  return (
    <Link
      href={`/requests/${request.id}`}
      className="group flex items-center gap-3.5 border-t border-[var(--border)] px-4 py-3.5 transition-colors first:border-t-0 hover:bg-[var(--surface-2)] sm:px-5"
    >
      <span className="dash-tile">{initial}</span>

      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium text-[var(--foreground)]">
          {preview || "No items listed"}
          {extra}
        </p>
        <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-[var(--muted)]">
          <span className="font-mono tracking-tight">
            #{request.id.slice(0, 6).toUpperCase()}
          </span>
          <span className="text-[var(--border-strong)]">/</span>
          <span>
            {request.items.length}{" "}
            {request.items.length === 1 ? "item" : "items"}
          </span>
          {request.tracking?.internalTrackingId && (
            <>
              <span className="text-[var(--border-strong)]">/</span>
              <span className="truncate font-mono">
                {request.tracking.internalTrackingId}
              </span>
            </>
          )}
        </p>
      </div>

      {request.createdAt && (
        <span className="hidden w-16 shrink-0 text-right text-[11px] tabular-nums text-[var(--muted)] sm:block">
          {request.createdAt.toDate().toLocaleDateString(undefined, {
            day: "numeric",
            month: "short",
          })}
        </span>
      )}

      <span className="flex shrink-0 items-center justify-end sm:w-[124px]">
        <StatusBadge status={request.status} />
      </span>

      <ChevronRight
        size={14}
        className="dash-arrow hidden shrink-0 text-[var(--muted-soft)] sm:block"
      />
    </Link>
  );
}

/* =========================================
   SHIPMENT CARD
========================================= */
const SHIPMENT_PHASES: { label: string; statuses: RequestStatus[] }[] = [
  { label: "Requested",    statuses: ["submitted", "review", "awaiting_payment"] },
  { label: "Paid",         statuses: ["paid"] },
  { label: "Purchased",    statuses: ["purchased"] },
  { label: "At warehouse", statuses: ["warehouse_received", "ready_for_international_shipping", "packed"] },
  { label: "In transit",   statuses: ["shipped", "out_for_delivery"] },
  { label: "Delivered",    statuses: ["delivered"] },
];

function ShipmentCard({ request }: { request: Request }) {
  const phaseIndex = SHIPMENT_PHASES.findIndex((p) =>
    p.statuses.includes(request.status)
  );

  const delivered = request.status === "delivered";
  const carrier   = request.tracking?.carrier;
  const eta       = request.tracking?.estimatedDelivery;

  const dotColor  = delivered ? "bg-emerald-500" : "bg-[var(--accent-solid)]";
  const ringColor = delivered
    ? "ring-4 ring-emerald-500/20"
    : "ring-4 ring-[color-mix(in_srgb,var(--accent-solid)_25%,transparent)]";

  // Progress bar percentage
  const pct =
    phaseIndex < 0
      ? 0
      : Math.round(((phaseIndex + 1) / SHIPMENT_PHASES.length) * 100);

  return (
    <div className="dash-card p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="app-kicker text-[var(--muted)]">
            ShipIN tracking
          </p>
          <p className="mt-1 truncate font-mono text-[13px] font-medium tracking-tight text-[var(--foreground)]">
            {request.tracking?.internalTrackingId}
          </p>
        </div>
        <Link
          href={`/requests/${request.id}`}
          aria-label="View shipment details"
          className="app-iconbtn -mr-1 -mt-1 h-9 w-9 text-[var(--muted)] hover:text-[var(--foreground)]"
        >
          <ArrowUpRight size={15} />
        </Link>
      </div>

      {/* Progress bar */}
      <div className="mt-4 h-[3px] w-full overflow-hidden rounded-full bg-[var(--surface-3)]">
        <div
          className="h-full rounded-full bg-[var(--accent-solid)] dash-progress-fill"
          style={{ width: `${pct}%` }}
        />
      </div>

      <ol className="mt-4">
        {SHIPMENT_PHASES.map((phase, i) => {
          const reached = phaseIndex >= 0 && i <= phaseIndex;
          const current = i === phaseIndex;
          return (
            <li key={phase.label} className="relative flex items-center gap-3 pb-3 last:pb-0">
              {i < SHIPMENT_PHASES.length - 1 && (
                <span
                  className={`absolute left-[5px] top-[15px] h-[18px] w-px ${
                    i < phaseIndex ? dotColor : "bg-[var(--border)]"
                  }`}
                />
              )}
              <span
                className={`relative z-[1] h-[11px] w-[11px] shrink-0 rounded-full ${
                  reached ? dotColor : "bg-[var(--border-strong)]"
                } ${current ? ringColor : ""}`}
              />
              <span
                className={`text-[12px] ${
                  current
                    ? "font-semibold text-[var(--foreground)]"
                    : reached
                    ? "text-[var(--foreground)] opacity-85"
                    : "text-[var(--muted)]"
                }`}
              >
                {phase.label}
              </span>
              {current && (
                <span className="ml-auto text-[10px] font-medium text-[var(--accent)]">Now</span>
              )}
            </li>
          );
        })}
      </ol>

      {(carrier || eta) && (
        <dl className="mt-4 space-y-1.5 border-t border-[var(--border)] pt-4 text-[11px]">
          {carrier && (
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-[var(--muted)]">Carrier</dt>
              <dd className="truncate font-medium text-[var(--foreground)]">{String(carrier)}</dd>
            </div>
          )}
          {eta && (
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-[var(--muted)]">Estimated delivery</dt>
              <dd className="font-medium text-[var(--foreground)]">{String(eta)}</dd>
            </div>
          )}
        </dl>
      )}

      <Link
        href={`/requests/${request.id}`}
        className="app-btn app-btn-secondary mt-4 w-full justify-center"
      >
        View shipment
        <ArrowRight size={12} className="dash-arrow" />
      </Link>
    </div>
  );
}

/* =========================================
   ATTENTION ROW
========================================= */
function AttentionRow({ request }: { request: Request }) {
  const mainPayment =
    request.status === "awaiting_payment" && !request.payment;
  const additionalPayment =
    request.additionalItemRequests?.some(
      (i) => i.status === "awaiting_payment"
    ) ?? false;

  let title       = "Action required";
  let description = "Open this request to continue.";
  let cta         = "Open";

  if (request.status === "review") {
    title       = "Quote ready to review";
    description = "Approve your quote to move this request forward.";
    cta         = "Review";
  } else if (mainPayment) {
    title       = "Payment due";
    description = "Your approved request is waiting for payment.";
    cta         = "Pay now";
  } else if (additionalPayment) {
    title       = "Extra item needs payment";
    description = "An approved additional item is awaiting payment.";
    cta         = "Pay now";
  }

  const Icon = mainPayment || additionalPayment ? CreditCard : AlertCircle;

  return (
    <Link
      href={`/requests/${request.id}`}
      className="dash-attention-row group flex items-center gap-3.5 px-5 py-3 transition-colors"
    >
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[color-mix(in_srgb,var(--accent-solid)_14%,transparent)] text-[var(--accent)]">
        <Icon size={15} />
      </span>

      <div className="min-w-0 flex-1">
        <p className="flex items-baseline gap-2 text-[13px] font-medium text-[var(--foreground)]">
          <span className="truncate">{title}</span>
          <span className="shrink-0 font-mono text-[10px] font-normal text-[var(--muted)]">
            #{request.id.slice(0, 6).toUpperCase()}
          </span>
        </p>
        <p className="mt-0.5 truncate text-[11.5px] text-[var(--muted)]">
          {description}
        </p>
      </div>

      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[var(--accent-solid)] px-3 py-1.5 text-[11px] font-semibold text-[#1a0b02]">
        {cta}
        <ArrowRight size={12} className="dash-arrow" />
      </span>
    </Link>
  );
}
