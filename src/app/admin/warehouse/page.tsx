import { PackageSearch } from "lucide-react";

/**
 * TODO: Warehouse operations dashboard.
 *
 * Planned features:
 *  - Incoming inventory overview
 *  - Storage location management
 *  - Picking/packing queue
 *  - Cross-reference with shipment pipeline
 *
 * Implementation starts after the warehouse panel component refactor.
 */
export default function WarehousePage() {
  return (
    <div className="flex flex-1 items-center justify-center">
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-800">
          <PackageSearch size={28} className="text-slate-400" />
        </div>
        <h2 className="text-lg font-semibold text-white">Warehouse Operations</h2>
        <p className="mt-1 text-sm text-slate-400">Coming soon — inventory & fulfillment tools.</p>
        <span className="mt-4 inline-block rounded-full bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-400">
          In Development
        </span>
      </div>
    </div>
  );
}