"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Download,
  ExternalLink,
  PackageCheck,
  RefreshCw,
  Search,
  ShoppingCart,
  X,
} from "lucide-react";
import { toast } from "sonner";

import ActionButton from "@/components/ui/ActionButton";
import EmptyState from "@/components/ui/EmptyState";
import StatusBadge from "@/components/ui/StatusBadge";
import { adminApi } from "@/lib/adminApiClient";
import { buildPurchaseHistoryCsv } from "@/utils/csv";
import {
  getAllRequests,
  getAdminRequestQueue,
} from "@/features/admin/services/requestQueue";
import type { Request } from "@/types/request";

/**
 * Purchasing workspace.
 *
 * Two queues, because they are two different jobs: orders that are paid and
 * still need to be bought, and orders already bought where an admin may need
 * to attach another store's receipt. Recording a purchase is the only action
 * here — it moves `paid → purchased` server-side, so this page never guesses
 * the status.
 */
type Tab = "to_buy" | "purchased";

const currency = (value?: number) =>
  typeof value === "number" ? `$${value.toFixed(2)}` : "—";

/** Vendor records may only be added before the parcel reaches the warehouse. */
const canRecordPurchase = (request: Request) =>
  request.status === "paid" || request.status === "purchased";

interface PurchasePayload {
  vendor: string;
  orderNumber?: string;
  amount: number;
  receiptUrl?: string;
  notes?: string;
}

const inputClass =
  "w-full rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:border-purple-500 focus:outline-none";

/**
 * One store's purchase for one request.
 *
 * Blank inputs are omitted rather than sent as empty strings, so the API's
 * optional fields mean "not provided" instead of "provided as nothing".
 */
function PurchaseForm({
  request,
  onSaved,
}: {
  request: Request;
  onSaved: () => void;
}) {
  const [vendor, setVendor] = useState("");
  const [orderNumber, setOrderNumber] = useState("");
  const [amount, setAmount] = useState("");
  const [receiptUrl, setReceiptUrl] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const alreadyPurchased = request.status !== "paid";

  async function submit() {
    const parsedAmount = Number(amount);

    if (!vendor.trim()) {
      toast.error("Enter the store you bought from.");
      return;
    }

    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      toast.error("Enter the amount paid at that store.");
      return;
    }

    const payload: PurchasePayload = {
      vendor: vendor.trim(),
      amount: Math.round(parsedAmount * 100) / 100,
      ...(orderNumber.trim() ? { orderNumber: orderNumber.trim() } : {}),
      ...(receiptUrl.trim() ? { receiptUrl: receiptUrl.trim() } : {}),
      ...(notes.trim() ? { notes: notes.trim() } : {}),
    };

    setSaving(true);

    try {
      await adminApi<{ success: true }>(
        `/api/admin/requests/${request.id}/purchase`,
        { method: "PATCH", body: payload }
      );

      toast.success(
        alreadyPurchased ? "Vendor added" : "Marked as purchased",
        {
          description: alreadyPurchased
            ? `${payload.vendor} was added to request #${request.id.slice(0, 6)}.`
            : `Request #${request.id.slice(0, 6)} is now in the warehouse queue.`,
        }
      );

      setVendor("");
      setOrderNumber("");
      setAmount("");
      setReceiptUrl("");
      setNotes("");
      onSaved();
    } catch (error) {
      console.error("Failed to record purchase:", error);
      toast.error("Could not record the purchase. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-5 space-y-3 border-t border-slate-800 pt-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="space-y-1 text-xs text-slate-400">
          <span>Store / vendor *</span>
          <input
            className={inputClass}
            value={vendor}
            onChange={(event) => setVendor(event.target.value)}
            placeholder="Amazon India"
          />
        </label>

        <label className="space-y-1 text-xs text-slate-400">
          <span>Order number</span>
          <input
            className={inputClass}
            value={orderNumber}
            onChange={(event) => setOrderNumber(event.target.value)}
            placeholder="IN-402-8891"
          />
        </label>

        <label className="space-y-1 text-xs text-slate-400">
          <span>Amount paid (USD) *</span>
          <input
            className={inputClass}
            value={amount}
            inputMode="decimal"
            onChange={(event) => setAmount(event.target.value)}
            placeholder="128.40"
          />
        </label>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-xs text-slate-400">
          <span>Receipt link</span>
          <input
            className={inputClass}
            value={receiptUrl}
            onChange={(event) => setReceiptUrl(event.target.value)}
            placeholder="https://…/receipt.pdf"
          />
        </label>

        <label className="space-y-1 text-xs text-slate-400">
          <span>Notes</span>
          <input
            className={inputClass}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Split shipment, one item cancelled"
          />
        </label>
      </div>

      <ActionButton
        type="button"
        size="sm"
        variant={alreadyPurchased ? "secondary" : "primary"}
        loading={saving}
        onClick={() => void submit()}
      >
        {alreadyPurchased ? "Add vendor record" : "Mark as purchased"}
      </ActionButton>
    </div>
  );
}

export default function PurchasingPage() {
  const [tab, setTab] = useState<Tab>("to_buy");
  const [toBuy, setToBuy] = useState<Request[]>([]);
  const [purchased, setPurchased] = useState<Request[]>([]);
  const [search, setSearch] = useState("");
  const [vendorFilter, setVendorFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [paidQueue, allRequests] = await Promise.all([
          getAdminRequestQueue("paid"),
          getAllRequests(),
        ]);

        if (cancelled) return;

        /*
         * Purchase history follows the records, not the status: a request that
         * has moved on to warehouse_received, packed or delivered keeps its
         * vendors and receipts here. A legacy request in `purchased` state with
         * no vendor records still shows so it can be completed.
         */
        const history = allRequests
          .filter(
            (request) =>
              request.status === "purchased" ||
              (request.purchases?.length ?? 0) > 0
          )
          .sort(
            (a, b) =>
              (b.purchasedAt?.toMillis() ?? 0) -
              (a.purchasedAt?.toMillis() ?? 0)
          );

        setToBuy(paidQueue);
        setPurchased(history);
        setError(null);
      } catch (loadError) {
        if (cancelled) return;
        console.error("Failed to load the purchasing queue:", loadError);
        setError(
          "Unable to load the purchasing queue. Check your connection and try again."
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [refreshToken]);

  function reload() {
    setLoading(true);
    setRefreshToken((token) => token + 1);
  }

  /* Every store that appears on either queue, so the filter is stable across tabs. */
  const vendors = useMemo(() => {
    const names = new Set<string>();

    for (const request of [...toBuy, ...purchased]) {
      for (const purchase of request.purchases ?? []) {
        if (purchase.vendor) names.add(purchase.vendor);
      }
    }

    return [...names].sort((a, b) => a.localeCompare(b));
  }, [toBuy, purchased]);

  /*
   * Search covers the things staff actually remember: the request number, the
   * customer's email, and the store / order number written on the receipt.
   */
  const visible = useMemo(() => {
    const base = tab === "to_buy" ? toBuy : purchased;
    const needle = search.trim().toLowerCase();

    return base.filter((request) => {
      if (
        vendorFilter &&
        !(request.purchases ?? []).some(
          (purchase) => purchase.vendor === vendorFilter
        )
      ) {
        return false;
      }

      if (!needle) return true;

      const haystack = [
        request.id,
        request.email ?? "",
        ...(request.purchases ?? []).flatMap((purchase) => [
          purchase.vendor,
          purchase.orderNumber ?? "",
          purchase.notes ?? "",
        ]),
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(needle);
    });
  }, [tab, toBuy, purchased, search, vendorFilter]);

  const filtered = search.trim().length > 0 || vendorFilter.length > 0;

  function clearFilters() {
    setSearch("");
    setVendorFilter("");
  }

  const exportableRows = visible.reduce(
    (total, request) => total + (request.purchases?.length ?? 0),
    0
  );

  /** Export exactly what the filters left on screen. */
  function exportCsv() {
    const { csv, rowCount } = buildPurchaseHistoryCsv(visible);

    if (rowCount === 0) return;

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = `shipin-purchase-history-${new Date()
      .toISOString()
      .slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);

    toast.success("Purchase history exported", {
      description: `${rowCount} purchase row${rowCount === 1 ? "" : "s"} downloaded.`,
    });
  }

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white">Purchasing</h1>
          <p className="mt-2 text-sm text-slate-400">
            Buy the items on paid requests, then record the store, order number
            and receipt. Recording a purchase moves the request into the
            warehouse queue.
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

      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Purchasing queues">
        {[
          { key: "to_buy" as const, label: "To purchase", count: toBuy.length },
          {
            key: "purchased" as const,
            label: "Purchase history",
            count: purchased.length,
          },
        ].map((option) => {
          const active = tab === option.key;

          return (
            <button
              key={option.key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => {
                setTab(option.key);
                // Vendor names come from purchase records, so that filter only
                // means something on the history tab.
                setVendorFilter("");
              }}
              className={`rounded-xl px-4 py-2 text-sm transition ${
                active
                  ? "bg-purple-600 text-white"
                  : "border border-slate-800 text-slate-300 hover:bg-slate-800 hover:text-white"
              }`}
            >
              {option.label}
              <span className="ml-2 text-xs opacity-70">{option.count}</span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label className="flex flex-1 items-center gap-2 rounded-xl border border-slate-800 bg-slate-900 px-4 py-2 text-sm text-slate-400 focus-within:border-purple-500 sm:max-w-md">
          <Search size={16} />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Request, email, store or order number"
            className="w-full bg-transparent text-white placeholder:text-slate-600 focus:outline-none"
          />
        </label>

        <label className="flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-400">
          <span className="sr-only">Filter by vendor</span>

          <select
            value={vendorFilter}
            onChange={(event) => setVendorFilter(event.target.value)}
            className="bg-transparent text-white focus:outline-none"
          >
            <option value="" className="bg-slate-900">
              All vendors
            </option>

            {vendors.map((vendor) => (
              <option key={vendor} value={vendor} className="bg-slate-900">
                {vendor}
              </option>
            ))}
          </select>
        </label>

        {tab === "purchased" && (
          <button
            type="button"
            onClick={exportCsv}
            disabled={exportableRows === 0}
            className="inline-flex items-center gap-1 rounded-xl border border-slate-800 px-3 py-2 text-xs text-slate-300 transition hover:bg-slate-800 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Download size={14} />
            Export CSV
          </button>
        )}

        {filtered && (
          <button
            type="button"
            onClick={clearFilters}
            className="inline-flex items-center gap-1 rounded-xl border border-slate-800 px-3 py-2 text-xs text-slate-400 transition hover:bg-slate-800 hover:text-white"
          >
            <X size={14} />
            Clear
          </button>
        )}

        <p className="text-xs text-slate-500">
          {visible.length} of {tab === "to_buy" ? toBuy.length : purchased.length}
        </p>
      </div>

      {error ? (
        <EmptyState
          icon={<ShoppingCart size={26} />}
          title="Purchasing queue unavailable"
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
      ) : loading && visible.length === 0 ? (
        <div className="space-y-4">
          {[0, 1, 2].map((key) => (
            <div
              key={key}
              className="h-52 animate-pulse rounded-2xl border border-slate-800 bg-slate-900"
            />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <EmptyState
          icon={
            filtered ? (
              <Search size={26} />
            ) : tab === "to_buy" ? (
              <ShoppingCart size={26} />
            ) : (
              <PackageCheck size={26} />
            )
          }
          title={
            filtered
              ? "No matching requests"
              : tab === "to_buy"
                ? "Nothing to buy"
                : "No purchase history yet"
          }
          description={
            filtered
              ? "No request in this queue matches that search or vendor. Clear the filters to see everything."
              : tab === "to_buy"
                ? "Orders appear here once the customer's payment is captured."
                : "Once a request is marked as purchased it stays here — with its stores and receipts — as it moves through the warehouse and shipping."
          }
          action={
            filtered ? (
              <button
                type="button"
                onClick={clearFilters}
                className="rounded-xl bg-purple-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-purple-500"
              >
                Clear filters
              </button>
            ) : undefined
          }
        />
      ) : (
        <div className="space-y-4">
          {visible.map((request) => (
            <article
              key={request.id}
              className="rounded-2xl border border-slate-800 bg-slate-900 p-6"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-3">
                    <Link
                      href={`/admin/requests/${request.id}`}
                      className="text-lg font-bold text-white transition hover:text-purple-400"
                    >
                      #{request.id.slice(0, 6)}
                    </Link>
                    <StatusBadge status={request.status} />
                  </div>
                  <p className="mt-1 text-sm text-slate-400">{request.email}</p>
                </div>

                <div className="text-right text-sm">
                  <p className="text-slate-500">Quoted total</p>
                  <p className="text-green-400">
                    {currency(request.quote?.breakdown?.grandTotal)}
                  </p>
                </div>
              </div>

              <ul className="mt-4 space-y-1 text-sm text-slate-300">
                {(request.items ?? []).map((item, index) => (
                  <li
                    key={`${item.name}-${index}`}
                    className="flex justify-between gap-3"
                  >
                    <span className="truncate">
                      {item.quantity} × {item.name}
                    </span>
                    <span className="shrink-0 text-slate-500">
                      {currency(item.subtotal ?? item.unitPrice)}
                    </span>
                  </li>
                ))}
              </ul>

              {(request.purchases ?? []).length > 0 && (
                <ul className="mt-4 space-y-2 border-t border-slate-800 pt-4 text-sm">
                  {(request.purchases ?? []).map((purchase, index) => (
                    <li
                      key={`${purchase.vendor}-${index}`}
                      className="flex flex-wrap items-center justify-between gap-2 text-slate-300"
                    >
                      <span>
                        <span className="font-medium text-white">
                          {purchase.vendor}
                        </span>
                        {purchase.orderNumber && (
                          <span className="ml-2 text-slate-500">
                            {purchase.orderNumber}
                          </span>
                        )}
                        {purchase.notes && (
                          <span className="ml-2 text-slate-500">
                            — {purchase.notes}
                          </span>
                        )}
                      </span>

                      <span className="flex items-center gap-3">
                        <span className="text-green-400">
                          {currency(purchase.amount)}
                        </span>
                        {purchase.receiptUrl && (
                          <a
                            href={purchase.receiptUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-purple-400 hover:text-purple-300"
                          >
                            Receipt
                            <ExternalLink size={13} />
                          </a>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              )}

              {canRecordPurchase(request) ? (
                <PurchaseForm request={request} onSaved={reload} />
              ) : (
                <p className="mt-5 border-t border-slate-800 pt-5 text-xs text-slate-500">
                  Purchase records are closed once a request leaves the
                  purchasing stage. The history above stays here for reference.
                </p>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
