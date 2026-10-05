"use client";

import type { RequestStatus } from "@/lib/requestStatus";

interface Props {
  status: RequestStatus;
}

const styles: Record<RequestStatus, string> = {
  submitted: "bg-blue-500/10 text-blue-400 ring-1 ring-blue-500/20",
  review: "bg-amber-500/10 text-amber-400 ring-1 ring-amber-500/20",
  awaiting_payment: "bg-amber-500/10 text-amber-400 ring-1 ring-amber-500/20",
  paid: "bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20",
  refund_requested: "bg-red-500/10 text-red-400 ring-1 ring-red-500/20",
  refund_offered: "bg-violet-500/10 text-violet-400 ring-1 ring-violet-500/20",
  purchased: "bg-violet-500/10 text-violet-400 ring-1 ring-violet-500/20",
  warehouse_received: "bg-indigo-500/10 text-indigo-400 ring-1 ring-indigo-500/20",
  ready_for_international_shipping:
    "bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20",
  packed: "bg-cyan-500/10 text-cyan-400 ring-1 ring-cyan-500/20",
  shipped: "bg-sky-500/10 text-sky-400 ring-1 ring-sky-500/20",
  out_for_delivery: "bg-pink-500/10 text-pink-400 ring-1 ring-pink-500/20",
  delivered: "bg-lime-500/10 text-lime-400 ring-1 ring-lime-500/20",
  refunded: "bg-red-500/10 text-red-400 ring-1 ring-red-500/20",
  rejected: "bg-red-500/10 text-red-400 ring-1 ring-red-500/20",
};

export default function StatusBadge({ status }: Props) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${
        styles[status] ?? "bg-slate-500/10 text-slate-400"
      }`}
    >
      {status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
    </span>
  );
}