"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Info, Truck } from "lucide-react";

import EmptyState from "@/components/ui/EmptyState";

const TRACKING_STAGES = [
  { status: "shipped", label: "Shipment Dispatched" },
  { status: "out_for_delivery", label: "Out For Delivery" },
  { status: "delivered", label: "Delivered" },
];

interface TrackingEvent {
  code: string;
  description: string;
  location?: string;
  occurredAt: string;
}

interface Shipment {
  trackingId: string;
  status: string;
  carrier?: string | null;
  estimatedDelivery: string | null;
  createdAt: string | null;
  statusHistory: Record<string, string | null>;
  /** Latest carrier events, newest first. */
  events?: TrackingEvent[];
  carrierStatus?: string | null;
  lastSyncedAt?: string | null;
  /** True once the parcel is delivered: we stop polling the carrier. */
  syncPaused?: boolean;
  syncPauseReason?: string | null;
  source?: "cache" | "carrier" | "placeholder";
  notice?: string;
}

function formatDate(value: string) {
  return new Date(value).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default function TrackingShell() {
  const params = useParams();
  const router = useRouter();
  const trackingId = params.trackingId as string;

  const [shipment, setShipment] = useState<Shipment | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadTracking() {
      try {
        setLoading(true);

        const response = await fetch(
          `/api/tracking/${encodeURIComponent(trackingId)}`
        );
        const data = await response.json();

        if (!response.ok || !data.success) {
          throw new Error(data.error || "Shipment not found.");
        }

        setShipment(data.shipment);
        setError("");
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to track shipment."
        );
      } finally {
        setLoading(false);
      }
    }

    if (trackingId) {
      void loadTracking();
    }
  }, [trackingId]);

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-12">
        <div className="h-10 w-56 animate-pulse rounded-lg bg-slate-800" />
        <div className="mt-8 h-40 animate-pulse rounded-2xl border border-slate-800 bg-slate-900" />
        <div className="mt-6 h-64 animate-pulse rounded-2xl border border-slate-800 bg-slate-900" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-xl p-8">
        <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-6">
          <h1 className="text-xl font-semibold text-red-400">
            Error Loading Shipment
          </h1>
          <p className="mt-2 text-slate-400">{error}</p>
          <button
            onClick={() => router.push("/track")}
            className="mt-5 rounded-xl bg-purple-600 px-5 py-3 font-semibold text-white transition hover:bg-purple-700"
          >
            Try Another Tracking ID
          </button>
        </div>
      </div>
    );
  }

  if (!shipment) {
    return (
      <div className="mx-auto max-w-xl p-8">
        <EmptyState
          icon={<Truck size={26} />}
          title="Shipment not found"
          description="We couldn't find a shipment associated with this tracking ID. Please check the tracking ID and try again."
        />
        <div className="mt-6 text-center">
          <button
            onClick={() => router.push("/track")}
            className="rounded-xl bg-purple-600 px-5 py-3 font-semibold text-white transition hover:bg-purple-700"
          >
            Try Another Tracking ID
          </button>
        </div>
      </div>
    );
  }

  const currentIndex = TRACKING_STAGES.findIndex(
    (stage) => stage.status === shipment.status
  );
  const events = shipment.events ?? [];

  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-4xl font-bold text-white">Track Shipment</h1>

      <div className="mt-8 rounded-2xl border border-slate-800 bg-slate-900 p-6">
        <p className="text-sm text-slate-400">ShipIN Tracking ID</p>
        <p className="mt-2 font-mono text-xl font-semibold text-purple-400">
          {shipment.trackingId}
        </p>

        <div className="mt-5 grid gap-5 sm:grid-cols-3">
          <div>
            <p className="text-sm text-slate-400">Carrier</p>
            <p className="mt-1 text-white">{shipment.carrier ?? "—"}</p>
          </div>

          <div>
            <p className="text-sm text-slate-400">Estimated Delivery</p>
            <p className="mt-1 text-white">
              {shipment.estimatedDelivery ?? "To be confirmed"}
            </p>
          </div>

          <div>
            <p className="text-sm text-slate-400">Last Update</p>
            <p className="mt-1 text-white">
              {shipment.lastSyncedAt ? formatDate(shipment.lastSyncedAt) : "—"}
            </p>
          </div>
        </div>
      </div>

      {shipment.notice && (
        <div className="mt-6 flex gap-3 rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4 text-sm text-amber-200">
          <Info size={18} className="mt-0.5 shrink-0" />
          <p>{shipment.notice}</p>
        </div>
      )}

      {shipment.source === "placeholder" && (
        <div className="mt-6 flex gap-3 rounded-2xl border border-slate-700 bg-slate-900 p-4 text-sm text-slate-400">
          <Info size={18} className="mt-0.5 shrink-0" />
          <p>
            The postal carrier feed is not connected yet, so the updates below
            are an illustrative sample rather than live scans.
          </p>
        </div>
      )}

      <div className="mt-8 rounded-2xl border border-slate-800 bg-slate-900 p-6">
        <h2 className="mb-6 text-xl font-semibold text-white">
          Shipment Progress
        </h2>

        <div className="space-y-6">
          {TRACKING_STAGES.map((stage, index) => {
            const completed = currentIndex >= index;
            const active = currentIndex === index;
            const date = shipment.statusHistory[stage.status];

            return (
              <div key={stage.status} className="flex gap-4">
                <div
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full font-bold ${
                    completed
                      ? "bg-emerald-500 text-white"
                      : "bg-slate-800 text-slate-500"
                  }`}
                >
                  {completed ? "✓" : index + 1}
                </div>

                <div>
                  <p
                    className={`font-medium ${
                      active
                        ? "text-emerald-400"
                        : completed
                          ? "text-white"
                          : "text-slate-500"
                    }`}
                  >
                    {stage.label}
                  </p>

                  {date && (
                    <p className="mt-1 text-xs text-slate-500">
                      {formatDate(date)}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {events.length > 0 && (
        <div className="mt-8 rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-xl font-semibold text-white">
              Carrier Updates
            </h2>
            <p className="text-xs text-slate-500">Newest first</p>
          </div>

          <ol className="mt-5 space-y-4">
            {events.map((event, index) => (
              <li
                key={`${event.code}-${event.occurredAt}-${index}`}
                className="border-l border-slate-700 pl-4"
              >
                <p className="text-sm text-white">{event.description}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {formatDate(event.occurredAt)}
                  {event.location ? ` · ${event.location}` : ""}
                </p>
              </li>
            ))}
          </ol>

          {shipment.syncPaused && (
            <p className="mt-5 border-t border-slate-800 pt-4 text-xs text-slate-500">
              {shipment.syncPauseReason === "delivered"
                ? "This parcel is delivered, so live updates have stopped. The history above is final."
                : "Updates for this shipment are closed."}
            </p>
          )}
        </div>
      )}

      <button
        onClick={() => router.push("/track")}
        className="mt-6 text-purple-400 hover:text-purple-300"
      >
        ← Track another shipment
      </button>
    </div>
  );
}
