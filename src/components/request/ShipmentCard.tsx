"use client";

interface Props {
  shipmentId?: string;

  packageCount?: number;

  tracking?: string;
}

export default function ShipmentCard({
  shipmentId,
  packageCount = 1,
  tracking,
}: Props) {
  if (!shipmentId) return null;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">

      <h2 className="text-2xl font-semibold text-white mb-6">
        Consolidated Shipment
      </h2>

      <div className="space-y-4">

        <div className="flex justify-between">
          <span className="text-slate-400">
            Shipment ID
          </span>

          <span className="text-white font-mono">
            {shipmentId}
          </span>
        </div>

        <div className="flex justify-between">
          <span className="text-slate-400">
            Packages
          </span>

          <span className="text-white">
            {packageCount}
          </span>
        </div>

        {tracking && (
          <div className="flex justify-between">
            <span className="text-slate-400">
              Tracking
            </span>

            <span className="text-green-400">
              {tracking}
            </span>
          </div>
        )}

      </div>

    </div>
  );
}