"use client";

import type { RequestStatus } from "@/lib/requestStatus";
import { statusLabels } from "@/lib/statusLabels";

interface Props {
  status: RequestStatus;
}

const meta: Record<RequestStatus, { dot: string; tone?: string }> = {
  submitted: { dot: "bg-slate-400" },
  review: {
    dot: "bg-blue-500",
    tone: "text-blue-700 dark:text-blue-300",
  },
  awaiting_payment: {
    dot: "bg-amber-500",
    tone: "text-amber-700 dark:text-amber-300",
  },
  paid: { dot: "bg-emerald-500" },
  purchased: { dot: "bg-violet-500" },
  warehouse_received: { dot: "bg-indigo-500" },
  ready_for_international_shipping: { dot: "bg-teal-500" },
  packed: { dot: "bg-cyan-500" },
  shipped: { dot: "bg-sky-500" },
  out_for_delivery: {
    dot: "bg-sky-500",
    tone: "text-sky-700 dark:text-sky-300",
  },
  delivered: { dot: "bg-emerald-500" },
  refund_requested: {
    dot: "bg-rose-500",
    tone: "text-rose-700 dark:text-rose-300",
  },
  refund_offered: {
    dot: "bg-violet-500",
    tone: "text-violet-700 dark:text-violet-300",
  },
  refunded: { dot: "bg-slate-400" },
  rejected: {
    dot: "bg-rose-500",
    tone: "text-rose-700 dark:text-rose-300",
  },
};

/**
 * Status is a dot plus a word. No pill soup, no colour-on-colour badges.
 */
export default function StatusBadge({ status }: Props) {
  const item = meta[status];

  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-[12px] font-medium leading-none">
      <span
        className={`h-1.5 w-1.5 shrink-0 rounded-full ${item?.dot ?? "bg-[var(--muted-soft)]"}`}
        aria-hidden="true"
      />
      <span className={item?.tone ?? "text-[var(--foreground)] opacity-90"}>
        {statusLabels[status] ??
          status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
      </span>
    </span>
  );
}
