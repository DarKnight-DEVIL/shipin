"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { collection, getDocs } from "firebase/firestore";
import { Inbox } from "lucide-react";

import { db } from "@/lib/firebase";
import RequestCard from "@/components/admin/RequestCard";
import type { Request } from "@/types/request";

export default function AdminRequestsPage() {
  const searchParams = useSearchParams();

  const filter = searchParams.get("status");

  const [requests, setRequests] = useState<Request[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadRequests() {
      try {
        const snapshot = await getDocs(
          collection(db, "requests")
        );

        const data = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as Request[];

        setRequests(data);
      } catch (error) {
        console.error(
          "Failed to load admin requests:",
          error
        );
      } finally {
        setLoading(false);
      }
    }

    loadRequests();
  }, []);

  /*
   * FILTER REQUESTS
   */
  const filteredRequests = filter
    ? requests.filter((request) => {
        /*
         * REFUND REQUESTED
         *
         * Only requests waiting for admin
         * refund processing.
         *
         * Already refunded requests are
         * intentionally excluded.
         */
        if (filter === "refund_requested") {
          return (
            request.refundRequest?.status ===
            "requested"
          );
        }

        /*
         * QUOTE UPDATE REQUESTED
         */
        if (filter === "quote_requested") {
          return (
            request.quoteRegenerationRequested ===
              true &&
            request.status !== "rejected" &&
            request.status !== "refunded"
          );
        }

        return request.status === filter;
      })
    : requests;

  /*
   * ========================================
   * ADMIN REQUEST PRIORITY
   * ========================================
   *
   * 1 — QUOTE REQUESTED
   * 2 — REFUND REQUESTED
   * 3 — NEW REQUEST
   * 4 — PAYMENT PAID
   * 5 — WAREHOUSE RECEIVED
   * 6 — PURCHASED
   * 7 — SHIPPED
   * 8 — AWAITING PAYMENT
   * 9 — OUT FOR DELIVERY
   * 10 — DELIVERED
   * 11 — REFUND OFFERED
   * 12 — REFUNDED
   * 13 — REJECTED
   */
  function getRequestPriority(
    request: Request
  ): number {
    /*
     * ========================================
     * 1 — QUOTE REQUESTED
     * ========================================
     */
    if (
      request.quoteRegenerationRequested === true &&
      request.status !== "rejected" &&
      request.status !== "refunded"
    ) {
      return 1;
    }

    /*
     * ========================================
     * 2 — REFUND REQUESTED
     * ========================================
     */
    if (
      request.refundRequest?.status ===
      "requested"
    ) {
      return 2;
    }

    /*
     * ========================================
     * 3 — NEW REQUEST
     * ========================================
     */
    if (
      request.status === "submitted" ||
      request.status === "review"
    ) {
      return 3;
    }

    /*
     * ========================================
     * 4 — PAYMENT PAID
     * ========================================
     */
    if (request.status === "paid") {
      return 4;
    }

    /*
     * ========================================
     * 5 — WAREHOUSE RECEIVED
     * ========================================
     */
    if (
      request.status === "warehouse_received"
    ) {
      return 5;
    }

    /*
     * ========================================
     * 6 — PURCHASED
     * ========================================
     */
    if (request.status === "purchased") {
      return 6;
    }

    /*
     * ========================================
     * 7 — SHIPPED
     * ========================================
     */
    if (
      request.status === "packed" ||
      request.status === "shipped"
    ) {
      return 7;
    }

    /*
     * ========================================
     * 8 — AWAITING PAYMENT
     * ========================================
     */
    if (
      request.status === "awaiting_payment"
    ) {
      return 8;
    }

    /*
     * ========================================
     * 9 — OUT FOR DELIVERY
     * ========================================
     */
    if (
      request.status === "out_for_delivery"
    ) {
      return 9;
    }

    /*
     * ========================================
     * 10 — DELIVERED
     * ========================================
     */
    if (request.status === "delivered") {
      return 10;
    }

    /*
     * ========================================
     * 11 — REFUND OFFERED
     * ========================================
     */
    if (
      request.refundOffer?.offered === true &&
      request.status !== "refunded" &&
      request.status !== "rejected"
    ) {
      return 11;
    }

    /*
     * ========================================
     * 12 — REFUNDED
     * ========================================
     */
    if (request.status === "refunded") {
      return 12;
    }

    /*
     * ========================================
     * 13 — REJECTED
     * ========================================
     */
    if (request.status === "rejected") {
      return 13;
    }

    /*
     * ========================================
     * EVERYTHING ELSE
     * ========================================
     */
    return 13;
  }

  const sortedRequests = [
    ...filteredRequests,
  ].sort(
    (a, b) =>
      getRequestPriority(a) -
      getRequestPriority(b)
  );

  /*
   * FILTER LABEL
   */
  const filterLabels: Record<string, string> = {
    submitted: "Submitted",
    review: "Under Review",
    awaiting_payment: "Awaiting Payment",
    warehouse_received: "Warehouse",
    shipped: "Shipped",
    delivered: "Delivered",
    quote_requested: "Quote Updates",
    refund_requested: "Refund Requests",
    refunded: "Refunded",
  };

  const filterLabel =
    filter
      ? filterLabels[filter] || filter
      : null;

  if (loading) {
    return (
      <div className="p-8 text-white">
        Loading requests...
      </div>
    );
  }

  return (
    <div className="p-8">
      {/* HEADER */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold text-white">
            Requests
          </h1>

          {filterLabel && (
            <p className="mt-2 text-slate-400">
              Showing {filterLabel} requests
            </p>
          )}
        </div>

        {/* CLEAR FILTER */}
        {filter && (
          <button
            type="button"
            onClick={() => {
              window.location.href =
                "/admin/requests";
            }}
            className="rounded-xl border border-slate-700 px-4 py-2 text-sm font-medium text-slate-300 transition hover:bg-slate-800 hover:text-white"
          >
            Clear Filter
          </button>
        )}
      </div>

      {/* REQUESTS */}
      {sortedRequests.length === 0 ? (
        <div className="flex min-h-[400px] items-center justify-center rounded-2xl border border-slate-800 bg-slate-900">
          <div className="text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-800 text-slate-400">
              <Inbox size={26} />
            </div>

            <h2 className="text-xl font-semibold text-white">
              {filterLabel
                ? `No ${filterLabel.toLowerCase()} requests`
                : "No requests found"}
            </h2>

            <p className="mt-2 max-w-md text-sm text-slate-400">
              {filterLabel
                ? `There are currently no ${filterLabel.toLowerCase()} requests.`
                : "There are currently no customer requests."}
            </p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
          {sortedRequests.map((request) => (
            <RequestCard
              key={request.id}
              request={request}
            />
          ))}
        </div>
      )}
    </div>
  );
}