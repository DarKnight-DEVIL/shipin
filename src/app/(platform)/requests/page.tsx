"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, AlertCircle, PackageOpen, Plus } from "lucide-react";

import { auth } from "@/lib/firebase";
import { subscribeToRequests } from "@/lib/firestore";
import type { Request } from "@/types/request";

import PageHeader from "@/components/ui/PageHeader";
import StatusBadge from "@/components/ui/StatusBadge";

const filterTitles: Record<string, string> = {
  submitted: "Submitted",
  review: "Quote ready",
  awaiting_payment: "Awaiting payment",
  paid: "Payment received",
  refund_requested: "Refund requested",
  purchased: "Purchased",
  warehouse_received: "Warehouse received",
  ready_for_international_shipping: "Ready to ship",
  packed: "Packed",
  shipped: "Shipped",
  in_transit: "In transit",
  refund_offered: "Refund offered",
  out_for_delivery: "Out for delivery",
  delivered: "Delivered",
  refunded: "Refunded",
  rejected: "Rejected",
};

const filterOptions = [
  { value: "", label: "All statuses" },
  { value: "submitted", label: "Submitted" },
  { value: "review", label: "Quote ready" },
  { value: "awaiting_payment", label: "Awaiting payment" },
  { value: "paid", label: "Payment received" },
  { value: "refund_requested", label: "Refund requested" },
  { value: "purchased", label: "Purchased" },
  { value: "warehouse_received", label: "Warehouse received" },
  { value: "ready_for_international_shipping", label: "Ready to ship" },
  { value: "packed", label: "Packed" },
  { value: "shipped", label: "Shipped" },
  { value: "in_transit", label: "In transit" },
  { value: "out_for_delivery", label: "Out for delivery" },
  { value: "delivered", label: "Delivered" },
  { value: "refunded", label: "Refunded" },
  { value: "rejected", label: "Rejected" },
];

/** Quick chips shown under the header */
const quickFilters = [
  { value: "", label: "All" },
  { value: "review", label: "Quote ready" },
  { value: "awaiting_payment", label: "Payment due" },
  { value: "in_transit", label: "In transit" },
  { value: "delivered", label: "Delivered" },
];

function RequestsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const statusFilter = searchParams.get("status");

  const pageTitle = statusFilter
    ? filterTitles[statusFilter] ?? "My requests"
    : "My requests";

  const [requests, setRequests] = useState<Request[]>([]);
  const [loading, setLoading] = useState(true);

  const setStatusFilter = (value: string) => {
    if (value) {
      router.push(`/requests?status=${value}`);
    } else {
      router.push("/requests");
    }
  };

  const handleStatusFilter = (
    event: React.ChangeEvent<HTMLSelectElement>
  ) => {
    setStatusFilter(event.target.value);
  };

  useEffect(() => {
    let unsubscribeRequests: (() => void) | undefined;

    const unsubscribeAuth = auth.onAuthStateChanged((user) => {
      if (!user) {
        setRequests([]);
        setLoading(false);
        if (unsubscribeRequests) unsubscribeRequests();
        return;
      }

      unsubscribeRequests = subscribeToRequests(user.uid, (data: Request[]) => {
        setRequests(data);
        setLoading(false);
      });
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeRequests) unsubscribeRequests();
    };
  }, []);

  const filteredRequests = useMemo(() => {
    const list = statusFilter
      ? requests.filter((request) => {
          if (statusFilter === "awaiting_payment") {
            const mainPayment =
              request.status === "awaiting_payment" && !request.payment;
            const additionalPayment =
              request.additionalItemRequests?.some(
                (item) => item.status === "awaiting_payment"
              ) ?? false;
            return mainPayment || additionalPayment;
          }

          if (statusFilter === "in_transit") {
            return (
              request.status === "shipped" ||
              request.status === "out_for_delivery"
            );
          }

          return request.status === statusFilter;
        })
      : requests;

    return [...list].sort((a, b) => {
      const aTime = a.createdAt?.seconds ?? 0;
      const bTime = b.createdAt?.seconds ?? 0;
      return bTime - aTime;
    });
  }, [requests, statusFilter]);

  if (loading) {
    return (
      <div className="app-page">
        <div className="mb-6 space-y-2">
          <div className="h-6 w-48 animate-pulse rounded bg-[var(--surface-3)]" />
          <div className="h-4 w-64 animate-pulse rounded bg-[var(--surface-3)]" />
        </div>

        <div className="app-panel app-panel-flush">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-4 border-t border-[var(--border)] px-5 py-4 first:border-t-0"
            >
              <div className="flex-1 space-y-2">
                <div className="h-3.5 w-48 animate-pulse rounded bg-[var(--surface-3)]" />
                <div className="h-3 w-32 animate-pulse rounded bg-[var(--surface-3)]" />
              </div>
              <div className="h-3 w-20 animate-pulse rounded bg-[var(--surface-3)]" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="app-page">
      <PageHeader
        title={pageTitle}
        subtitle={
          statusFilter
            ? `${filteredRequests.length} matching request${
                filteredRequests.length === 1 ? "" : "s"
              }`
            : `${requests.length} request${
                requests.length === 1 ? "" : "s"
              } · quotes, payments and deliveries in one place`
        }
        actions={
          <Link href="/requests/new" className="app-btn app-btn-primary">
            <Plus size={15} strokeWidth={2.5} />
            New request
          </Link>
        }
      />

      {/* TOOLBAR */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {quickFilters.map((chip) => {
          const active = (statusFilter ?? "") === chip.value;
          return (
            <button
              key={chip.value || "all"}
              type="button"
              onClick={() => setStatusFilter(chip.value)}
              data-active={active}
              className="app-chip"
            >
              {chip.label}
            </button>
          );
        })}

        <div className="ml-auto flex items-center gap-2">
          <label htmlFor="status-filter" className="sr-only">
            Filter by status
          </label>

          <select
            id="status-filter"
            value={statusFilter ?? ""}
            onChange={handleStatusFilter}
            className="app-select h-[30px] w-auto py-0 text-[12px] font-medium"
          >
            {filterOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* LIST */}
      {requests.length === 0 ? (
        <div className="app-panel border-dashed px-6 py-16 text-center">
          <PackageOpen
            size={20}
            className="mx-auto text-[var(--muted-soft)]"
          />
          <h2 className="mt-3 text-[13px] font-semibold text-[var(--foreground)]">
            No requests yet
          </h2>
          <p className="mx-auto mt-1.5 max-w-xs text-[12px] leading-5 text-[var(--muted)]">
            Create your first request with a product link and we&apos;ll handle
            the quote, purchase and shipping.
          </p>
          <Link href="/requests/new" className="app-btn app-btn-primary mt-5">
            <Plus size={14} strokeWidth={2.5} />
            Create request
          </Link>
        </div>
      ) : filteredRequests.length === 0 ? (
        <div className="app-panel px-6 py-16 text-center">
          <h2 className="text-[13px] font-semibold text-[var(--foreground)]">
            Nothing in this status
          </h2>
          <p className="mt-1 text-[12px] text-[var(--muted)]">
            You have {requests.length} request
            {requests.length === 1 ? "" : "s"} in other states.
          </p>
          <button
            type="button"
            onClick={() => setStatusFilter("")}
            className="app-btn app-btn-secondary mt-5"
          >
            View all requests
          </button>
        </div>
      ) : (
        <div className="app-panel app-panel-flush">
          <div className="hidden items-center gap-4 bg-[var(--surface-2)] px-5 py-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)] sm:flex">
            <span className="flex-1">Request</span>
            <span className="w-16 text-right">Created</span>
            <span className="w-[160px] text-right">Status</span>
          </div>

          {filteredRequests.map((request) => {
            const itemCount = request.items?.length ?? 0;
            const isRejected = request.status === "rejected";

            const needsPayment =
              (request.status === "awaiting_payment" && !request.payment) ||
              (request.additionalItemRequests?.some(
                (item) => item.status === "awaiting_payment"
              ) ??
                false);

            const quoteReady = request.status === "review";
            const needsAttention = needsPayment || quoteReady;

            const preview =
              request.items
                ?.slice(0, 2)
                .map((item) => item.name)
                .join(", ") ?? "";
            const extraCount = Math.max(0, itemCount - 2);

            const date = request.createdAt?.toDate();

            return (
              <Link
                key={request.id}
                href={`/requests/${request.id}`}
                className="group relative flex items-start gap-4 border-t border-[var(--border)] px-5 py-4 transition-colors hover:bg-[var(--surface-2)] sm:items-center"
              >
                {needsAttention && (
                  <span
                    className={`absolute left-0 top-0 h-full w-[3px] ${
                      quoteReady ? "bg-[var(--accent)]" : "bg-[var(--accent-solid)]"
                    }`}
                  />
                )}

                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium text-[var(--foreground)]">
                    {preview || "No items listed"}
                    {extraCount > 0 && (
                      <span className="ml-1 text-[var(--muted)]">
                        +{extraCount}
                      </span>
                    )}
                  </p>

                  <p className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px] text-[var(--muted)]">
                    <span className="font-mono tracking-tight">
                      #{request.id.slice(0, 6).toUpperCase()}
                    </span>
                    <span className="text-[var(--border-strong)]">/</span>
                    <span>
                      {itemCount} {itemCount === 1 ? "item" : "items"}
                    </span>

                    {request.tracking?.internalTrackingId && (
                      <>
                        <span className="text-[var(--border-strong)]">/</span>
                        <span className="truncate font-mono">
                          {request.tracking.internalTrackingId}
                        </span>
                      </>
                    )}

                    {date && (
                      <>
                        <span className="text-[var(--border-strong)] sm:hidden">
                          /
                        </span>
                        <span className="tabular-nums sm:hidden">
                          {date.toLocaleDateString(undefined, {
                            day: "numeric",
                            month: "short",
                          })}
                        </span>
                      </>
                    )}
                  </p>

                  {isRejected && request.rejectionReason && (
                    <p className="mt-1.5 line-clamp-2 text-[11.5px] leading-5 text-rose-600 dark:text-rose-400">
                      {request.rejectionReason}
                    </p>
                  )}

                  {needsPayment && !isRejected && (
                    <p className="mt-1.5 flex items-center gap-1 text-[11px] font-medium text-amber-700 dark:text-amber-400">
                      <AlertCircle size={11} />
                      Payment required to continue
                    </p>
                  )}

                  {quoteReady && (
                    <p className="mt-1.5 flex items-center gap-1 text-[11px] font-medium text-blue-700 dark:text-blue-300">
                      <AlertCircle size={11} />
                      Quote ready — review and approve
                    </p>
                  )}
                </div>

                <span className="hidden w-16 shrink-0 text-right text-[11px] tabular-nums text-[var(--muted)] sm:block">
                  {date
                    ? date.toLocaleDateString(undefined, {
                        day: "numeric",
                        month: "short",
                      })
                    : "—"}
                </span>

                <span className="flex shrink-0 items-center justify-end gap-2 sm:w-[160px]">
                  <StatusBadge status={request.status} />
                  <ArrowRight
                    size={13}
                    className="dash-arrow text-[var(--muted-soft)] opacity-0 transition-opacity group-hover:opacity-100"
                  />
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function RequestsPage() {
  return (
    <Suspense
      fallback={
        <div className="app-page">
          <div className="h-6 w-48 animate-pulse rounded bg-[var(--surface-3)]" />
        </div>
      }
    >
      <RequestsPageContent />
    </Suspense>
  );
}
