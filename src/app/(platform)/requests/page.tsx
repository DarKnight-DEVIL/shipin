"use client";

import {
  Suspense,
  useEffect,
  useState,
} from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  PackageOpen,
  AlertCircle,
  MessageCircle,
  RotateCcw,
  ChevronDown,
} from "lucide-react";

import { auth } from "@/lib/firebase";
import { subscribeToRequests } from "@/lib/firestore";
import { statusLabels } from "@/lib/statusLabels";
import { statusColors } from "@/lib/statusColors";

import EmptyState from "@/components/ui/EmptyState";

import type { Request } from "@/types/request";

const cardMessage: Record<
  string,
  { text: string; style: string }
> = {
  review: {
    text: "Your request is being reviewed",
    style:
      "bg-blue-500/10 border-blue-500/20 text-blue-700 dark:text-blue-300",
  },

  awaiting_payment: {
    text: "Payment Required • Click to complete checkout",
    style:
      "bg-yellow-500/10 border-yellow-500/20 text-yellow-700 dark:text-yellow-300",
  },

  purchased: {
    text: "Updates Available • Click to view shipment progress",
    style:
      "bg-blue-500/10 border-blue-500/20 text-blue-700 dark:text-blue-300",
  },

  warehouse_received: {
    text: "Updates Available • Click to view shipment progress",
    style:
      "bg-blue-500/10 border-blue-500/20 text-blue-700 dark:text-blue-300",
  },

  packed: {
    text: "Updates Available • Click to view shipment progress",
    style:
      "bg-blue-500/10 border-blue-500/20 text-blue-700 dark:text-blue-300",
  },

  shipped: {
    text: "Updates Available • Click to track your shipment",
    style:
      "bg-blue-500/10 border-blue-500/20 text-blue-700 dark:text-blue-300",
  },

  out_for_delivery: {
    text: "Updates Available • Delivery is approaching",
    style:
      "bg-blue-500/10 border-blue-500/20 text-blue-700 dark:text-blue-300",
  },

  refund_requested: {
    text: "Refund Requested • Click to view details",
    style:
      "bg-red-500/10 border-red-500/20 text-red-700 dark:text-red-300",
  },

  rejected: {
    text: "Request Rejected • Click to view details",
    style:
      "bg-red-500/10 border-red-500/20 text-red-700 dark:text-red-300",
  },
};

const filterTitles: Record<string, string> = {
  submitted: "Submitted Requests",
  review: "Quote Ready Requests",
  awaiting_payment: "Awaiting Payment",
  paid: "Payment Confirmed",
  refund_requested: "Refund Requested",
  purchased: "Purchased Requests",
  warehouse_received: "Warehouse Received",
  ready_for_international_shipping: "Ready for International Shipping",
  packed: "Packed Requests",
  shipped: "Shipped Requests",
  in_transit: "In Transit",
  refund_offered: "Refund Offered",
  out_for_delivery: "Out for Delivery",
  delivered: "Delivered Requests",
  refunded: "Refunded Requests",
  rejected: "Rejected Requests",
};

const filterOptions = [
  { value: "", label: "All Requests" },
  { value: "submitted", label: "Submitted" },
  { value: "review", label: "Quote Ready" },
  { value: "awaiting_payment", label: "Awaiting Payment" },
  { value: "paid", label: "Payment Confirmed" },
  {
    value: "refund_requested",
    label: "Refund Requested",
  },
  { value: "purchased", label: "Items Purchased" },
  { value: "warehouse_received", label: "At Warehouse" },
  {
    value: "ready_for_international_shipping",
    label: "Ready to Ship",
  },
  { value: "packed", label: "Packed" },
  { value: "shipped", label: "Shipped" },
  { value: "in_transit", label: "In Transit" },
  { value: "out_for_delivery", label: "Out for Delivery" },
  { value: "delivered", label: "Delivered" },
  { value: "refunded", label: "Refunded" },
  { value: "rejected", label: "Rejected" },
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

  const handleStatusFilter = (
    event: React.ChangeEvent<HTMLSelectElement>
  ) => {
    const value = event.target.value;

    if (value) {
      router.push(`/requests?status=${value}`);
    } else {
      router.push("/requests");
    }
  };

  useEffect(() => {
    let unsubscribeRequests: (() => void) | undefined;

    const unsubscribeAuth = auth.onAuthStateChanged((user) => {
      if (!user) {
        setRequests([]);
        setLoading(false);

        if (unsubscribeRequests) {
          unsubscribeRequests();
        }

        return;
      }

      unsubscribeRequests = subscribeToRequests(
        user.uid,
        (data: Request[]) => {
          setRequests(data);
          setLoading(false);
        }
      );
    });

    return () => {
      unsubscribeAuth();

      if (unsubscribeRequests) {
        unsubscribeRequests();
      }
    };
  }, []);

  // Complete Filtering Logic
  const filteredRequests = statusFilter
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

  if (loading) {
    return (
      <div className="p-8 text-slate-600 dark:text-slate-400">
        Loading requests...
      </div>
    );
  }

  return (
    <div className="shipin-page w-full px-6 py-8 lg:px-10">
      {/* ========================================
          HEADER
      ======================================== */}

      <div className="mb-8 flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
        {/* TITLE */}
        <div>
          <h1 className="text-4xl font-bold text-slate-950 dark:text-white">
            {pageTitle}
          </h1>

          <p className="mt-2 text-slate-500 dark:text-slate-400">
            {statusFilter
              ? `Showing your ${
                  filterTitles[statusFilter]?.toLowerCase() ??
                  "filtered requests"
                }.`
              : "View and manage your ShipIN purchase requests."}
          </p>
        </div>

        {/* ACTIONS */}
        <div className="flex shrink-0 items-center gap-3">
          {/* FILTER */}
          <div className="relative">
            <select
              value={statusFilter ?? ""}
              onChange={handleStatusFilter}
              className="
                appearance-none
                rounded-xl
                border
                border-slate-200
                bg-white
                py-3
                pl-4
                pr-11
                text-sm
                font-medium
                text-slate-700
                shadow-sm
                outline-none
                transition
                hover:border-purple-300
                focus:border-purple-500
                focus:ring-2
                focus:ring-purple-500/20
                dark:border-slate-800
                dark:bg-slate-900
                dark:text-slate-200
                dark:hover:border-purple-500/40
              "
            >
              {filterOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>

            <ChevronDown
              size={18}
              className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-slate-400"
            />
          </div>

          {/* NEW REQUEST */}
          <button
            type="button"
            onClick={() => router.push("/requests/new")}
            className="shipin-btn-primary whitespace-nowrap px-5 py-3 text-sm"
          >
            + New Request
          </button>
        </div>
      </div>

      {/* ========================================
          EMPTY STATE & FILTERED RESULTS
      ======================================== */}

      {requests.length === 0 ? (
        <EmptyState
          icon={<PackageOpen size={26} />}
          title="No requests yet"
          description="Create your first request to start importing products with ShipIN."
          action={
            <button
              type="button"
              onClick={() => router.push("/requests/new")}
              className="shipin-btn-primary px-5 py-3 text-sm"
            >
              Create Request
            </button>
          }
        />
      ) : filteredRequests.length === 0 ? (
        <div className="shipin-card flex min-h-[320px] items-center justify-center p-8">
          <div className="text-center">
            <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
              <PackageOpen size={26} />
            </div>

            <h2 className="text-xl font-semibold text-slate-950 dark:text-white">
              No matching requests
            </h2>

            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
              There are no requests with this status.
            </p>

            <button
              type="button"
              onClick={() => router.push("/requests")}
              className="mt-5 rounded-xl bg-purple-600 px-5 py-3 font-semibold text-white transition hover:bg-purple-700"
            >
              View All Requests
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {filteredRequests.map((request) => {
            const dynamicBanner = cardMessage[request.status];

            const itemCount = request.items?.length ?? 0;

            const isRejected = request.status === "rejected";

            /*
             * Rejected requests get their
             * own explicit styling.
             */

            const statusColor = isRejected
              ? "border-red-500/30 bg-red-500/10 text-red-400"
              : statusColors[
                  request.status as keyof typeof statusColors
                ] || "border-slate-700 bg-slate-800 text-slate-400";

            return (
              <Link
                key={request.id}
                href={`/requests/${request.id}`}
                className="block"
              >
                <article
                  className={`
                    shipin-card p-6
                    ${
                      isRejected
                        ? "border-red-200 hover:border-red-400 dark:border-red-500/30 dark:hover:border-red-500"
                        : ""
                    }
                  `}
                >
                  {/* ========================================
                      REQUEST HEADER
                  ======================================== */}

                  <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
                        Purchase Request
                      </p>

                      <h2 className="mb-3 text-xl font-semibold text-slate-950 dark:text-white">
                        Request #
                        {request.id.slice(0, 6).toUpperCase()}
                      </h2>

                      <div
                        className={`
                          inline-flex
                          items-center
                          gap-2
                          rounded-full
                          border
                          px-4
                          py-2
                          text-sm
                          font-semibold
                          ${statusColor}
                        `}
                      >
                        {isRejected && <AlertCircle size={16} />}

                        {statusLabels[request.status] ||
                          (isRejected ? "Rejected" : request.status)}
                      </div>
                    </div>

                    <div
                      className={`
                        self-start
                        rounded-xl
                        px-4
                        py-2
                        font-medium
                        ${
                          isRejected
                            ? "bg-red-500/10 text-red-700 dark:text-red-300"
                            : "bg-purple-500/10 text-purple-700 dark:text-purple-300"
                        }
                      `}
                    >
                      {itemCount} {itemCount === 1 ? "Item" : "Items"}
                    </div>
                  </div>

                  {/* ========================================
                      REJECTED NOTICE
                  ======================================== */}

                  {isRejected && (
                    <div className="mb-6 rounded-2xl border border-red-500/20 bg-red-500/5 p-5 dark:bg-red-500/10">
                      <div className="flex items-start gap-3">
                        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-500/10">
                          <AlertCircle
                            size={20}
                            className="text-red-500"
                          />
                        </div>

                        <div className="min-w-0">
                          <h3 className="font-semibold text-red-700 dark:text-red-300">
                            This request was rejected
                          </h3>

                          <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                            Please review the reason below. You can open the
                            request for complete details and support.
                          </p>
                        </div>
                      </div>

                      {request.rejectionReason && (
                        <div className="mt-4 rounded-xl border border-red-500/20 bg-white/70 p-4 dark:bg-slate-950/40">
                          <p className="text-xs font-semibold uppercase tracking-wide text-red-500 dark:text-red-400">
                            Reason for rejection
                          </p>

                          <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700 dark:text-slate-200">
                            {request.rejectionReason}
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* ========================================
                      PRODUCTS
                  ======================================== */}

                  {itemCount > 0 && (
                    <div className="space-y-3">
                      {request.items.map((item: any, index: number) => (
                        <div
                          key={index}
                          className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950"
                        >
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div className="min-w-0">
                              <h3 className="font-semibold text-slate-900 dark:text-white">
                                {item.name}
                              </h3>

                              <p className="mt-1 break-all text-sm text-slate-500 dark:text-slate-500">
                                {item.url}
                              </p>
                            </div>

                            <div className="shrink-0 text-sm font-medium text-slate-600 dark:text-slate-400">
                              Qty: {item.quantity}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* ========================================
                      ACTION BANNER
                  ======================================== */}

                  {dynamicBanner && (
                    <div
                      className={`
                        mt-6
                        rounded-xl
                        border
                        p-4
                        font-medium
                        ${dynamicBanner.style}
                      `}
                    >
                      {dynamicBanner.text}
                    </div>
                  )}

                  {/* ========================================
                      REJECTED ACTIONS
                  ======================================== */}

                  {isRejected && (
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-purple-500/10">
                          <MessageCircle
                            size={18}
                            className="text-purple-600 dark:text-purple-400"
                          />
                        </div>

                        <div>
                          <p className="font-semibold text-slate-900 dark:text-white">
                            Need help?
                          </p>

                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            Open the request for support options.
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-500/10">
                          <RotateCcw
                            size={18}
                            className="text-blue-600 dark:text-blue-400"
                          />
                        </div>

                        <div>
                          <p className="font-semibold text-slate-900 dark:text-white">
                            Start again
                          </p>

                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            Create a new request if needed.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* ========================================
                      NOTES
                  ======================================== */}

                  {(request as any).notes && (
                    <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950">
                      <h3 className="mb-2 font-semibold text-slate-900 dark:text-white">
                        Notes
                      </h3>

                      <p className="text-slate-600 dark:text-slate-400">
                        {(request as any).notes}
                      </p>
                    </div>
                  )}

                  {/* ========================================
                      FOOTER
                  ======================================== */}

                  <div className="mt-6 flex items-center justify-between border-t border-slate-200 pt-4 dark:border-slate-800">
                    <span className="text-sm text-slate-500 dark:text-slate-400">
                      {isRejected
                        ? "View rejection details"
                        : "Open request details"}
                    </span>

                    <span className="font-medium text-purple-600 dark:text-purple-400">
                      View Request →
                    </span>
                  </div>
                </article>
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
        <div className="p-8 text-slate-600 dark:text-slate-400">
          Loading requests...
        </div>
      }
    >
      <RequestsPageContent />
    </Suspense>
  );
}