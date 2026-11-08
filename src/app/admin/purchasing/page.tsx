import { Inbox } from "lucide-react";

/**
 * TODO: Purchasing workflow dashboard.
 *
 * Planned features:
 *  - Queue of incoming orders awaiting purchase
 *  - Filter by plan tier, store, status
 *  - Bulk assign procurement agents
 *  - Track purchase timelines vs SLA
 *
 * Implementation starts after the shipping pipeline refactor.
 */
export default function PurchasingPage() {
  return (
    <div className="flex flex-1 items-center justify-center">
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-800">
          <Inbox size={28} className="text-slate-400" />
        </div>
        <h2 className="text-lg font-semibold text-white">Purchasing Pipeline</h2>
        <p className="mt-1 text-sm text-slate-400">Coming soon — tracking inbound orders.</p>
        <span className="mt-4 inline-block rounded-full bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-400">
          In Development
        </span>
      </div>
    </div>
  );
}