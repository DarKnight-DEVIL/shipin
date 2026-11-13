"use client";

import { useEffect, useMemo, useState } from "react";
import { Inbox, RefreshCw, Search } from "lucide-react";

import RequestCard from "@/components/admin/RequestCard";
import EmptyState from "@/components/ui/EmptyState";
import {
  getAdminRequestQueue,
  type AdminRequestFilter,
} from "@/features/admin/services/requestQueue";
import type { Request } from "@/types/request";

/**
 * Admin request queue.
 *
 * The filter list mirrors `matchesAdminRequestFilter`, so each chip maps to a
 * real slice of the queue rather than being cosmetic. Results stay ordered by
 * the operational priority the service already computes: quote requests first,
 * then refunds, then anything newly submitted.
 */
const FILTERS: { key: AdminRequestFilter; label: string }[] = [
  { key: null, label: "All" },
  { key: "quote_requested", label: "Needs quote" },
  { key: "refund_requested", label: "Refunds" },
  { key: "submitted", label: "Submitted" },
  { key: "review", label: "Review" },
  { key: "awaiting_payment", label: "Awaiting payment" },
  { key: "paid", label: "Paid" },
  { key: "purchased", label: "Purchased" },
  { key: "warehouse_received", label: "Warehouse" },
  { key: "packed", label: "Packed" },
  { key: "shipped", label: "Shipped" },
  { key: "delivered", label: "Delivered" },
  { key: "rejected", label: "Rejected" },
];

export default function AdminRequestsPage() {
  const [filter, setFilter] = useState<AdminRequestFilter>(null);
  const [search, setSearch] = useState("");
  const [requests, setRequests] = useState<Request[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const queue = await getAdminRequestQueue(filter);
        if (cancelled) return;
        setRequests(queue);
        setError(null);
      } catch (loadError) {
        if (cancelled) return;
        console.error("Failed to load the request queue:", loadError);
        setError("Unable to load requests. Check your connection and try again.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [filter, refreshToken]);

  function reload() {
    setLoading(true);
    setRefreshToken((token) => token + 1);
  }

  function selectFilter(nextFilter: AdminRequestFilter) {
    if (nextFilter === filter) return;
    setLoading(true);
    setFilter(nextFilter);
  }

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();

    if (!needle) return requests;

    return requests.filter(
      (request) =>
        request.id.toLowerCase().includes(needle) ||
        (request.email ?? "").toLowerCase().includes(needle)
    );
  }, [requests, search]);

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white">Requests</h1>
          <p className="mt-2 text-sm text-slate-400">
            Quote, purchase and ship customer requests. Items needing attention
            are listed first.
          </p>
        </div>

        <button
          type="button"
          onClick={reload}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-800 px-4 py-2 text-sm text-slate-300 transition hover:bg-slate-800 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          <RefreshCw size={16} className={loading ? "animate-spin" : undefined} />
          Refresh
        </button>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-900 px-4 py-2 text-sm text-slate-400 focus-within:border-purple-500">
          <Search size={16} />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by email or request ID"
            aria-label="Search requests"
            className="w-64 bg-transparent text-sm text-white placeholder:text-slate-500 focus:outline-none"
          />
        </label>

        <div className="flex flex-wrap gap-2">
          {FILTERS.map((option) => {
            const active = option.key === filter;

            return (
              <button
                key={option.label}
                type="button"
                onClick={() => selectFilter(option.key)}
                aria-pressed={active}
                className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                  active
                    ? "bg-purple-600 text-white"
                    : "bg-slate-900 text-slate-400 hover:bg-slate-800 hover:text-white"
                }`}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </div>

      {error ? (
        <EmptyState
          icon={<Inbox size={26} />}
          title="Requests unavailable"
          description={error}
          action={
            <button
              type="button"
              onClick={reload}
              className="rounded-xl bg-purple-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-purple-500"
            >
              Try again
            </button>
          }
        />
      ) : loading && requests.length === 0 ? (
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((key) => (
            <div
              key={key}
              className="h-56 animate-pulse rounded-2xl border border-slate-800 bg-slate-900"
            />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <EmptyState
          icon={<Inbox size={26} />}
          title={search ? "No matching requests" : "Nothing in this queue"}
          description={
            search
              ? "No request matches that email or ID. Clear the search to see the full queue."
              : "Requests appear here as soon as a customer submits them."
          }
        />
      ) : (
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {visible.map((request) => (
            <RequestCard key={request.id} request={request} />
          ))}
        </div>
      )}
    </div>
  );
}
