"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ChevronRight } from "lucide-react";

import { getShipment, getShipmentRequests } from "@/lib/shipment";
import PageHeader from "@/components/ui/PageHeader";

export default function ShipmentPage() {
  const { id } = useParams();

  const [shipment, setShipment] = useState<any>(null);

  const [requests, setRequests] = useState<any[]>([]);

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      if (!id) {
        setLoading(false);
        return;
      }

      try {
        const shipmentData = await getShipment(id as string);

        if (shipmentData) {
          setShipment(shipmentData);

          const reqs = await getShipmentRequests(shipmentData.id);

          setRequests(reqs);
        }
      } catch (error) {
        console.error("Shipment loading failed:", error);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [id]);

  if (loading) {
    return (
      <div className="app-page">
        <div className="mb-6 h-6 w-40 animate-pulse rounded bg-[var(--surface-3)]" />
        <div className="grid gap-5 lg:grid-cols-3">
          <div className="app-panel h-64 animate-pulse lg:col-span-2" />
          <div className="app-panel h-64 animate-pulse" />
        </div>
      </div>
    );
  }

  if (!shipment) {
    return (
      <div className="app-page">
        <div className="app-panel px-6 py-14 text-center">
          <h1 className="text-[15px] font-semibold text-[var(--foreground)]">
            Shipment not found
          </h1>
          <p className="mt-1 text-[12px] text-[var(--muted)]">
            The tracking link may be incorrect or the shipment was removed.
          </p>
          <Link href="/requests" className="app-btn app-btn-secondary mt-5">
            Back to requests
          </Link>
        </div>
      </div>
    );
  }

  const details: { label: string; value: string; mono?: boolean }[] = [
    { label: "Shipment ID", value: String(shipment.id), mono: true },
    { label: "Status", value: String(shipment.status ?? "—") },
    { label: "Courier", value: shipment.courier ? String(shipment.courier) : "—" },
    { label: "Tracking", value: shipment.tracking ? String(shipment.tracking) : "—", mono: true },
    {
      label: "Weight",
      value: shipment.weight ? `${shipment.weight} kg` : "—",
    },
    {
      label: "Dimensions",
      value:
        shipment.length && shipment.width && shipment.height
          ? `${shipment.length} × ${shipment.width} × ${shipment.height} cm`
          : "—",
    },
  ];

  return (
    <div className="app-page">
      <PageHeader
        backHref="/requests"
        backLabel="Requests"
        eyebrow="Shipment"
        title="Shipment details"
        subtitle={
          shipment.tracking
            ? `Tracking ${shipment.tracking}`
            : "Tracking information for this shipment"
        }
      />

      <div className="grid gap-5 lg:grid-cols-3">
        {/* Packages */}
        <section className="app-panel app-panel-flush lg:col-span-2">
          <div className="flex items-baseline justify-between gap-3 border-b border-[var(--border)] px-5 py-3.5">
            <h2 className="app-section-title">Packages</h2>
            <span className="text-[11px] tabular-nums text-[var(--muted)]">
              {requests.length} {requests.length === 1 ? "request" : "requests"}
            </span>
          </div>

          {requests.length === 0 ? (
            <p className="px-5 py-10 text-center text-[12px] text-[var(--muted)]">
              No requests are linked to this shipment yet.
            </p>
          ) : (
            <div className="app-list">
              {requests.map((request) => (
                <Link
                  key={request.id}
                  href={`/requests/${request.id}`}
                  className="group flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-[var(--surface-2)]"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-[13px] font-medium text-[var(--foreground)]">
                      #{request.id.slice(0, 6).toUpperCase()}
                    </p>
                    <p className="mt-0.5 text-[11px] text-[var(--muted)]">
                      {request.items?.length ?? 0}{" "}
                      {(request.items?.length ?? 0) === 1 ? "item" : "items"}
                      {request.status ? ` · ${request.status}` : ""}
                    </p>
                  </div>

                  <ChevronRight
                    size={14}
                    className="text-[var(--muted-soft)] transition-transform group-hover:translate-x-0.5"
                  />
                </Link>
              ))}
            </div>
          )}
        </section>

        {/* Details */}
        <section className="app-panel p-5">
          <h2 className="app-section-title mb-3.5">Details</h2>

          <dl className="space-y-2.5 text-[12px]">
            {details.map((item) => (
              <div
                key={item.label}
                className="flex items-baseline justify-between gap-4"
              >
                <dt className="text-[var(--muted)]">{item.label}</dt>
                <dd
                  className={`min-w-0 truncate text-right text-[var(--foreground)] ${
                    item.mono ? "font-mono" : ""
                  }`}
                >
                  {item.value}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      </div>
    </div>
  );
}
