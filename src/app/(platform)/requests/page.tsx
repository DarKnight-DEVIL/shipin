"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  PackageOpen,
  AlertCircle,
  MessageCircle,
  RotateCcw,
  ChevronDown,
  Plus,
  Package,
  ArrowRight,
  CreditCard,
  Truck,
} from "lucide-react";
import { motion } from "framer-motion";

import { auth } from "@/lib/firebase";
import { subscribeToRequests } from "@/lib/firestore";
import { statusLabels } from "@/lib/statusLabels";
import { statusColors } from "@/lib/statusColors";

import EmptyState from "@/components/ui/EmptyState";

import type { Request } from "@/types/request";

const cardMessage: Record<string, { text: string; style: string }> = {
  review: {
    text: "Quote ready — review and approve to continue",
    style:
      "bg-blue-500/10 border-blue-500/20 text-blue-700 dark:text-blue-300",
  },
  awaiting_payment: {
    text: "Payment required — complete checkout to proceed",
    style:
      "bg-amber-500/10 border-amber-500/20 text-amber-700 dark:text-amber-300",
  },
  purchased: {
    text: "Items purchased — track progress in details",
    style:
      "bg-purple-500/10 border-purple-500/20 text-purple-700 dark:text-purple-300",
  },
  warehouse_received: {
    text: "At warehouse — inspection and packing next",
    style:
      "bg-indigo-500/10 border-indigo-500/20 text-indigo-700 dark:text-indigo-300",
  },
  packed: {
    text: "Packed — ready for international dispatch",
    style:
      "bg-cyan-500/10 border-cyan-500/20 text-cyan-700 dark:text-cyan-300",
  },
  shipped: {
    text: "Shipped — tracking is available",
    style: "bg-sky-500/10 border-sky-500/20 text-sky-700 dark:text-sky-300",
  },
  out_for_delivery: {
    text: "Out for delivery — almost there",
    style: "bg-sky-500/10 border-sky-500/20 text-sky-700 dark:text-sky-300",
  },
  refund_requested: {
    text: "Refund requested — view details",
    style: "bg-red-500/10 border-red-500/20 text-red-700 dark:text-red-300",
  },
  rejected: {
    text: "Request rejected — see reason below",
    style: "bg-red-500/10 border-red-500/20 text-red-700 dark:text-red-300",
  },
};

const filterTitles: Record<string, string> = {
  submitted: "Submitted",
  review: "Quote Ready",
  awaiting_payment: "Awaiting Payment",
  paid: "Payment Confirmed",
  refund_requested: "Refund Requested",
  purchased: "Purchased",
  warehouse_received: "At Warehouse",
  ready_for_international_shipping: "Ready to Ship",
  packed: "Packed",
  shipped: "Shipped",
  in_transit: "In Transit",
  refund_offered: "Refund Offered",
  out_for_delivery: "Out for Delivery",
  delivered: "Delivered",
  refunded: "Refunded",
  rejected: "Rejected",
};

const filterOptions = [
  { value: "", label: "All requests" },
  { value: "submitted", label: "Submitted" },
  { value: "review", label: "Quote Ready" },
  { value: "awaiting_payment", label: "Awaiting Payment" },
  { value: "paid", label: "Payment Confirmed" },
  { value: "refund_requested", label: "Refund Requested" },
  { value: "purchased", label: "Items Purchased" },
  { value: "warehouse_received", label: "At Warehouse" },
  { value: "ready_for_international_shipping", label: "Ready to Ship" },
  { value: "packed", label: "Packed" },
  { value: "shipped", label: "Shipped" },
  { value: "in_transit", label: "In Transit" },
  { value: "out_for_delivery", label: "Out for Delivery" },
  { value: "delivered", label: "Delivered" },
  { value: "refunded", label: "Refunded" },
  { value: "rejected", label: "Rejected" },
];

/** Quick chips shown under the header */
const quickFilters = [
  { value: "", label: "All" },
  { value: "review", label: "Quote Ready" },
  { value: "awaiting_payment", label: "Payment" },
  { value: "in_transit", label: "In Transit" },
  { value: "delivered", label: "Delivered" },
];

function RequestsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const statusFilter = searchParams.get("status");

  const pageTitle = statusFilter
    ? filterTitles[statusFilter] ?? "My Requests"
    : "My Requests";

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
      <div className="shipin-page w-full px-6 py-8 lg:px-10">
        <div className="mb-8 space-y-3">
          <div className="h-9 w-56 animate-pulse rounded-xl bg-slate-200 dark:bg-slate-800" />
          <div className="h-5 w-80 max-w-full animate-pulse rounded-lg bg-slate-200 dark:bg-slate-800" />
        </div>
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="shipin-card h-40 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="shipin-page w-full px-6 py-8 lg:px-10"
    >
      {/* HEADER */}
      <div className="mb-6 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-950 dark:text-white sm:text-4xl">
            {pageTitle}
          </h1>
          <p className="mt-2 text-slate-500 dark:text-slate-400">
            {statusFilter
              ? `${filteredRequests.length} matching request${
                  filteredRequests.length === 1 ? "" : "s"
                }`
              : `${requests.length} total request${
                  requests.length === 1 ? "" : "s"
                } · view and manage your orders`}
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-3">
          <div className="relative">
            <select
              value={statusFilter ?? ""}
              onChange={handleStatusFilter}
              className="appearance-none rounded-xl border border-slate-200 bg-white py-2.5 pl-4 pr-10 text-sm font-medium text-slate-700 shadow-sm outline-none transition hover:border-purple-300 focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-purple-500/40"
            >
              {filterOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <ChevronDown
              size={16}
              className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
          </div>

          <button
            type="button"
            onClick={() => router.push("/requests/new")}
            className="shipin-btn-primary inline-flex items-center gap-2 whitespace-nowrap px-5 py-2.5 text-sm"
          >
            <Plus size={16} />
            New Request
          </button>
        </div>
      </div>

      {/* QUICK FILTER CHIPS */}
      <div className="mb-6 flex flex-wrap gap-2">
        {quickFilters.map((chip) => {
          const active = (statusFilter ?? "") === chip.value;
          return (
            <button
              key={chip.value || "all"}
              type="button"
              onClick={() => setStatusFilter(chip.value)}
              className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
                active
                  ? "bg-purple-600 text-white shadow-sm"
                  : "border border-slate-200 bg-white text-slate-600 hover:border-purple-300 hover:text-purple-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400 dark:hover:border-purple-500/40 dark:hover:text-purple-300"
              }`}
            >
              {chip.label}
            </button>
          );
        })}
      </div>

      {/* LIST */}
      {requests.length === 0 ? (
        <EmptyState
          icon={<PackageOpen size={26} />}
          title="No requests yet"
          description="Create your first request to start importing products with ShipIN."
          action={
            <button
              type="button"
              onClick={() => router.push("/requests/new")}
              className="shipin-btn-primary inline-flex items-center gap-2 px-5 py-3 text-sm"
            >
              <Plus size={16} />
              Create Request
            </button>
          }
        />
      ) : filteredRequests.length === 0 ? (
        <div className="shipin-card flex min-h-[280px] items-center justify-center p-8">
          <div className="text-center">
            <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
              <PackageOpen size={26} />
            </div>
            <h2 className="text-xl font-semibold text-slate-950 dark:text-white">
              No matching requests
            </h2>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
              Nothing in this status right now.
            </p>
            <button
              type="button"
              onClick={() => router.push("/requests")}
              className="shipin-btn-primary mt-5 px-5 py-3 text-sm"
            >
              View all requests
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredRequests.map((request, index) => {
            const dynamicBanner = cardMessage[request.status];
            const itemCount = request.items?.length ?? 0;
            const isRejected = request.status === "rejected";
            const needsPayment =
              (request.status === "awaiting_payment" && !request.payment) ||
              (request.additionalItemRequests?.some(
                (item) => item.status === "awaiting_payment"
              ) ??
                false);

            const statusColor = isRejected
              ? "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400"
              : statusColors[request.status as keyof typeof statusColors] ||
                "border-slate-300 bg-slate-100 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400";

            const previewItems = request.items?.slice(0, 2) ?? [];
            const extraCount = Math.max(0, itemCount - 2);

            return (
              <motion.div
                key={request.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(index * 0.04, 0.2), duration: 0.35 }}
              >
                <Link href={`/requests/${request.id}`} className="block">
                  <article
                    className={`shipin-card p-5 transition hover:shadow-md sm:p-6 ${
                      isRejected
                        ? "border-red-200 dark:border-red-500/30"
                        : needsPayment
                          ? "border-amber-200/80 dark:border-amber-500/25"
                          : ""
                    }`}
                  >
                    {/* Top row */}
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="flex min-w-0 items-start gap-3">
                        <div
                          className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                            isRejected
                              ? "bg-red-500/10 text-red-600 dark:text-red-400"
                              : needsPayment
                                ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                                : "bg-purple-500/10 text-purple-600 dark:text-purple-400"
                          }`}
                        >
                          {needsPayment ? (
                            <CreditCard size={18} />
                          ) : request.status === "shipped" ||
                            request.status === "out_for_delivery" ? (
                            <Truck size={18} />
                          ) : isRejected ? (
                            <AlertCircle size={18} />
                          ) : (
                            <Package size={18} />
                          )}
                        </div>

                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h2 className="text-lg font-semibold text-slate-950 dark:text-white">
                              Request #{request.id.slice(0, 6).toUpperCase()}
                            </h2>
                            <span
                              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${statusColor}`}
                            >
                              {isRejected && <AlertCircle size={12} />}
                              {statusLabels[request.status] ||
                                (isRejected ? "Rejected" : request.status)}
                            </span>
                          </div>

                          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                            {itemCount} {itemCount === 1 ? "item" : "items"}
                            {request.createdAt && (
                              <>
                                {" · "}
                                {request.createdAt.toDate().toLocaleDateString(
                                  undefined,
                                  {
                                    year: "numeric",
                                    month: "short",
                                    day: "numeric",
                                  }
                                )}
                              </>
                            )}
                            {request.tracking?.internalTrackingId && (
                              <>
                                {" · "}
                                <span className="font-medium text-slate-600 dark:text-slate-300">
                                  {request.tracking.internalTrackingId}
                                </span>
                              </>
                            )}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Rejection */}
                    {isRejected && (
                      <div className="mt-4 rounded-xl border border-red-500/20 bg-red-500/5 p-4 dark:bg-red-500/10">
                        <p className="text-sm font-semibold text-red-700 dark:text-red-300">
                          This request was rejected
                        </p>
                        {request.rejectionReason && (
                          <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-red-600/90 dark:text-red-400">
                            {request.rejectionReason}
                          </p>
                        )}
                      </div>
                    )}

                    {/* Item preview */}
                    {itemCount > 0 && (
                      <div className="mt-4 space-y-2">
                        {previewItems.map((item, i) => (
                          <div
                            key={i}
                            className="flex items-start justify-between gap-3 rounded-xl border border-slate-200/80 bg-slate-50/80 px-3.5 py-2.5 dark:border-slate-800 dark:bg-slate-950/50"
                          >
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium text-slate-900 dark:text-white">
                                {item.name}
                              </p>
                              {item.url && (
                                <p className="mt-0.5 truncate text-xs text-slate-400">
                                  {item.url}
                                </p>
                              )}
                            </div>
                            <span className="shrink-0 text-xs font-medium text-slate-500">
                              ×{item.quantity}
                            </span>
                          </div>
                        ))}
                        {extraCount > 0 && (
                          <p className="px-1 text-xs font-medium text-slate-400">
                            +{extraCount} more item{extraCount === 1 ? "" : "s"}
                          </p>
                        )}
                      </div>
                    )}

                    {/* Action banner */}
                    {dynamicBanner && !isRejected && (
                      <div
                        className={`mt-4 rounded-xl border px-3.5 py-2.5 text-sm font-medium ${dynamicBanner.style}`}
                      >
                        {dynamicBanner.text}
                      </div>
                    )}

                    {/* Rejected helpers */}
                    {isRejected && (
                      <div className="mt-4 grid gap-2 sm:grid-cols-2">
                        <div className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 dark:border-slate-800 dark:bg-slate-950">
                          <MessageCircle
                            size={16}
                            className="shrink-0 text-purple-600 dark:text-purple-400"
                          />
                          <span className="text-xs text-slate-600 dark:text-slate-400">
                            Open request for support options
                          </span>
                        </div>
                        <div className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 dark:border-slate-800 dark:bg-slate-950">
                          <RotateCcw
                            size={16}
                            className="shrink-0 text-blue-600 dark:text-blue-400"
                          />
                          <span className="text-xs text-slate-600 dark:text-slate-400">
                            Create a new request if needed
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Footer */}
                    <div className="mt-4 flex items-center justify-between border-t border-slate-200 pt-3 dark:border-slate-800">
                      <span className="text-sm text-slate-500 dark:text-slate-400">
                        {isRejected
                          ? "View rejection details"
                          : needsPayment
                            ? "Complete payment"
                            : "Open request details"}
                      </span>
                      <span className="inline-flex items-center gap-1 text-sm font-semibold text-purple-600 dark:text-purple-400">
                        View
                        <ArrowRight size={14} />
                      </span>
                    </div>
                  </article>
                </Link>
              </motion.div>
            );
          })}
        </div>
      )}
    </motion.div>
  );
}

export default function RequestsPage() {
  return (
    <Suspense
      fallback={
        <div className="shipin-page w-full px-6 py-8 lg:px-10">
          <div className="h-9 w-56 animate-pulse rounded-xl bg-slate-200 dark:bg-slate-800" />
        </div>
      }
    >
      <RequestsPageContent />
    </Suspense>
  );
}