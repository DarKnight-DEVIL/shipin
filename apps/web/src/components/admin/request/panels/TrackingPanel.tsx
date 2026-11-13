"use client";

import { useState } from "react";
import { RefreshCw, Satellite, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import ActionButton from "@/components/ui/ActionButton";
import Section from "@/components/ui/Section";
import { adminApi } from "@/lib/adminApiClient";
import type { Request } from "@/types/request";

interface Props {
  request: Request;
}

interface RefreshResponse {
  success: true;
  shipment: {
    carrierStatus: string | null;
    lastSyncedAt: string | null;
    syncPaused: boolean;
    syncPauseReason: string | null;
    events: { code: string; description: string; location?: string; occurredAt: string }[];
    notice?: string;
  };
}

function formatWhen(value?: { toDate?: () => Date } | string | null) {
  if (!value) return "Never";

  if (typeof value === "string") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? "Never" : parsed.toLocaleString();
  }

  if (typeof value.toDate === "function") {
    return value.toDate().toLocaleString();
  }

  return "Never";
}

const PAUSE_COPY: Record<string, string> = {
  delivered: "Paused — carrier confirmed delivery. Automatic polls have stopped; a manual refresh still works.",
  terminal_status: "Paused — this request is closed, so automatic polls have stopped.",
  no_carrier_number: "Waiting — no consignment number has been recorded yet.",
};

/**
 * Tracking sync state for one request.
 *
 * Read-only apart from the refresh button: the automatic policy (15 minute
 * cache, stop at delivery) lives in the tracking proxy, and this panel exists
 * to show that policy's state and to override it once, deliberately.
 */
export default function TrackingPanel({ request }: Props) {
  const tracking = request.tracking;
  const [refreshing, setRefreshing] = useState(false);
  const [lastResult, setLastResult] = useState<RefreshResponse["shipment"] | null>(
    null
  );

  const events = lastResult?.events ?? tracking?.events ?? [];
  const carrierStatus = lastResult?.carrierStatus ?? tracking?.carrierStatus ?? null;
  const lastSyncedAt = lastResult?.lastSyncedAt ?? tracking?.lastSyncedAt ?? null;
  const syncPaused = lastResult?.syncPaused ?? tracking?.syncPaused ?? false;
  const pauseReason = lastResult?.syncPauseReason ?? null;
  const notice = lastResult?.notice;

  const provider = tracking?.provider ?? "not yet pulled";
  const feedLabel =
    provider === "indiapost"
      ? "India Post (live)"
      : provider === "placeholder"
        ? "Placeholder feed"
        : "Not connected";

  const canRefresh = Boolean(tracking?.trackingNumber);

  async function refreshNow() {
    setRefreshing(true);

    try {
      const result = await adminApi<RefreshResponse>(
        `/api/admin/requests/${request.id}/tracking/refresh`,
        { method: "POST" }
      );

      setLastResult(result.shipment);
      toast.success("Tracking refreshed", {
        description: `${result.shipment.events.length} carrier event(s) on record.`,
      });
    } catch (error) {
      console.error("Failed to refresh tracking:", error);
      toast.error("Could not refresh tracking", {
        description:
          error instanceof Error ? error.message : "The carrier call failed.",
      });
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <div className="space-y-6">
      <Section title="Tracking sync">
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="text-xs text-slate-500">ShipIN number</p>
            <p className="mt-1 font-mono text-sm text-white">
              {tracking?.internalTrackingId ?? "Not created"}
            </p>
          </div>

          <div>
            <p className="text-xs text-slate-500">Consignment number</p>
            <p className="mt-1 font-mono text-sm text-white">
              {tracking?.trackingNumber ?? "—"}
            </p>
            <p className="mt-1 text-xs text-slate-600">Never shown to customers</p>
          </div>

          <div>
            <p className="text-xs text-slate-500">Feed</p>
            <p className="mt-1 text-sm text-white">{feedLabel}</p>
          </div>

          <div>
            <p className="text-xs text-slate-500">Carrier status</p>
            <p className="mt-1 text-sm text-white">{carrierStatus ?? "—"}</p>
          </div>

          <div>
            <p className="text-xs text-slate-500">Last synced</p>
            <p className="mt-1 text-sm text-white">{formatWhen(lastSyncedAt)}</p>
          </div>

          <div>
            <p className="text-xs text-slate-500">Estimated delivery</p>
            <p className="mt-1 text-sm text-white">
              {tracking?.estimatedDelivery ?? "—"}
            </p>
          </div>

          <div>
            <p className="text-xs text-slate-500">Events stored</p>
            <p className="mt-1 text-sm text-white">{events.length}</p>
          </div>

          <div>
            <p className="text-xs text-slate-500">Polling</p>
            <p className="mt-1 text-sm text-white">
              {syncPaused ? "Paused" : "Active"}
            </p>
          </div>
        </div>

        {syncPaused && (
          <p className="mt-5 rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-200">
            {PAUSE_COPY[pauseReason ?? "delivered"] ?? PAUSE_COPY.delivered}
          </p>
        )}

        {notice && (
          <p className="mt-4 flex items-start gap-2 text-xs text-slate-400">
            <TriangleAlert size={14} className="mt-0.5 shrink-0" />
            {notice}
          </p>
        )}

        {provider === "placeholder" && (
          <p className="mt-4 text-xs text-slate-500">
            These scans come from the placeholder feed because no India Post
            credentials are set. They are synthetic and will be replaced by live
            scans once the carrier is connected.
          </p>
        )}

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <ActionButton
            type="button"
            size="sm"
            variant="secondary"
            loading={refreshing}
            disabled={!canRefresh || refreshing}
            onClick={() => void refreshNow()}
          >
            <RefreshCw size={14} className="mr-1" />
            Refresh from carrier
          </ActionButton>

          {!canRefresh && (
            <span className="text-xs text-slate-500">
              Add a consignment number in the Shipment tab first.
            </span>
          )}
        </div>
      </Section>

      <Section title="Carrier events">
        {events.length === 0 ? (
          <p className="flex items-center gap-2 text-sm text-slate-500">
            <Satellite size={16} />
            No carrier scans recorded yet.
          </p>
        ) : (
          <ol className="space-y-3">
            {events.map((event, index) => (
              <li
                key={`${event.code}-${event.occurredAt}-${index}`}
                className="border-l border-slate-800 pl-4"
              >
                <p className="text-sm text-white">{event.description}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {new Date(event.occurredAt).toLocaleString()}
                  {event.location ? ` · ${event.location}` : ""}
                  <span className="ml-2 font-mono text-slate-600">{event.code}</span>
                </p>
              </li>
            ))}
          </ol>
        )}
      </Section>
    </div>
  );
}
