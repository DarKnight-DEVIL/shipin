import { PackageSearch } from "lucide-react";
import EmptyState from "@/components/ui/EmptyState";

/**
 * Warehouse operations dashboard.
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
    <div className="p-8">
      <EmptyState
        icon={<PackageSearch size={26} />}
        title="Warehouse Operations"
        description="Coming soon — inventory & fulfillment tools."
        action={
          <span className="inline-block rounded-full bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-400">
            In Development
          </span>
        }
      />
    </div>
  );
}