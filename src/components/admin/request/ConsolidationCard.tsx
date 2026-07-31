"use client";

interface Props {
  shipmentId?: string;

  onCreateShipment: () => void;

  onAddToShipment: () => void;
}

export default function ConsolidationCard({
  shipmentId,
  onCreateShipment,
  onAddToShipment,
}: Props) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">

      <h2 className="text-2xl font-semibold text-white mb-6">
        Package Consolidation
      </h2>

      {!shipmentId ? (
        <>
          <p className="text-slate-400 mb-6">
            This package is not assigned to any shipment.
          </p>

          <button
            onClick={onCreateShipment}
            className="w-full bg-purple-600 hover:bg-purple-700 rounded-xl py-3 font-semibold"
          >
            Create Shipment
          </button>
        </>
      ) : (
        <>
          <p className="text-slate-400 mb-2">
            Shipment ID
          </p>

          <div className="bg-slate-950 rounded-xl p-4 text-white font-mono mb-6">
            {shipmentId}
          </div>

          <button
            onClick={onAddToShipment}
            className="w-full bg-green-600 hover:bg-green-700 rounded-xl py-3 font-semibold"
          >
            Add Another Package
          </button>
        </>
      )}

    </div>
  );
}