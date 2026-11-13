"use client";

import Link from "next/link";
import {
  ArrowRight,
  ChevronRight,
  PackageOpen,
  Plus,
  Truck,
} from "lucide-react";
import type { CSSProperties } from "react";
import dynamic from "next/dynamic";

const AttentionRow = dynamic(
  () => import("@/components/dashboard/AttentionRow").then((mod) => mod.default),
  { ssr: false, loading: () => <div className="h-24 animate-pulse rounded-2xl border border-slate-800 bg-slate-900" /> }
);

const MetricCard = dynamic(
  () => import("@/components/dashboard/MetricCard").then((mod) => mod.default),
  { ssr: false, loading: () => <div className="h-32 animate-pulse rounded-2xl border border-slate-800 bg-slate-900" /> }
);

const RequestRow = dynamic(
  () => import("@/components/dashboard/RequestRow").then((mod) => mod.default),
  { ssr: false, loading: () => <div className="h-20 animate-pulse rounded-xl border border-slate-800 bg-slate-900" /> }
);

const ShipmentCard = dynamic(
  () => import("@/components/dashboard/ShipmentCard").then((mod) => mod.default),
  { ssr: false, loading: () => <div className="h-48 animate-pulse rounded-2xl border border-slate-800 bg-slate-900" /> }
);

import { SHORTCUTS } from "@/components/dashboard/helpers";
import { useDashboardOverview } from "@/features/users/hooks/useDashboardOverview";

export default function DashboardPage() {
  const {
    requests,
    loading,
    userName,
    visibleMetrics,
    metricValues,
    attentionRequired,
    recentRequests,
    latestShipment,
  } = useDashboardOverview();

  const greeting = (() => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";
    return "Good evening";
  })();

  const today = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  const statusLine = (() => {
    if (requests.length === 0)
      return "Your requests, payments and shipments will appear here.";

    const facts: string[] = [];
    if (metricValues.in_transit > 0)
      facts.push(`${metricValues.in_transit} in transit`);
    if (attentionRequired.length > 0)
      facts.push(
        `${attentionRequired.length} ${
          attentionRequired.length === 1 ? "needs" : "need"
        } your input`
      );
    if (metricValues.delivered > 0)
      facts.push(`${metricValues.delivered} delivered`);
    if (facts.length === 0)
      facts.push(
        `${requests.length} request${requests.length === 1 ? "" : "s"} so far`
      );

    return facts.join(" · ");
  })();

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

        <Link href="/requests/new" className="app-btn app-btn-primary app-btn-lg">
          <Plus size={15} strokeWidth={2.5} aria-hidden="true" />
          <span className="roll">
            <span>New request</span>
            <span aria-hidden="true">New request</span>
          </span>
        </Link>
      </header>

      {attentionRequired.length > 0 && (
        <section
          className="dash-in dash-attention"
          style={{ "--i": 1 } as CSSProperties}
        >
          <span className="dash-attention-rail" />

          <div className="flex items-center gap-2.5 px-5 py-3">
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
            {attentionRequired.slice(0, 4).map((request) => (
              <AttentionRow key={request.id} request={request} />
            ))}
          </div>
        </section>
      )}

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

      <div className="grid gap-6 lg:grid-cols-3">
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
                  {recentRequests.map((request) => (
                    <RequestRow key={request.id} request={request} />
                  ))}
                </div>
              </>
            )}
          </div>
        </section>

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
