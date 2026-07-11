"use client";

import type { Tracking } from "@/types/request";

interface Props {
  tracking?: Tracking;
}

export default function TrackingCard({
  tracking,
}: Props) {
  if (!tracking) return null;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 mb-8">

      <h2 className="text-2xl font-semibold text-white mb-6">
        Tracking Information
      </h2>

      <div className="space-y-4">

        <InfoRow
          label="Carrier"
          value={tracking.carrier}
        />

        <InfoRow
          label="Tracking Number"
          value={tracking.trackingNumber}
        />

        <InfoRow
          label="Estimated Delivery"
          value={tracking.estimatedDelivery}
        />

        {tracking.trackingUrl && (
          <a
            href={tracking.trackingUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex mt-4 rounded-xl bg-blue-600 hover:bg-blue-700 px-5 py-3 font-semibold transition text-white"
          >
            Track Package
          </a>
        )}

      </div>

    </div>
  );
}

function InfoRow({
  label,
  value,
}: {
  label: string;
  value?: string;
}) {
  return (
    <div className="flex justify-between border-b border-slate-800 pb-3">

      <span className="text-slate-400">
        {label}
      </span>

      <span className="text-white font-medium">
        {value || "-"}
      </span>

    </div>
  );
}