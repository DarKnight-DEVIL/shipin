"use client";

import type { RequestStatus } from "@/lib/requestStatus";

interface Props {
  status: RequestStatus;
}

const styles: Record<RequestStatus, string> = {
  submitted: "bg-blue-500/10 text-blue-400",

  review: "bg-yellow-500/10 text-yellow-400",

  awaiting_payment: "bg-amber-500/10 text-amber-400",

  paid: "bg-green-500/10 text-green-400",

  refund_requested: "bg-red-500/10 text-red-400",

  refund_offered: "bg-purple-500/10 text-purple-400",

  purchased: "bg-purple-500/10 text-purple-400",

  warehouse_received: "bg-indigo-500/10 text-indigo-400",

  ready_for_international_shipping:
    "bg-emerald-500/10 text-emerald-400",

  packed: "bg-cyan-500/10 text-cyan-400",

  shipped: "bg-sky-500/10 text-sky-400",

  out_for_delivery: "bg-pink-500/10 text-pink-400",

  delivered: "bg-lime-500/10 text-lime-400",

  refunded: "bg-red-500/10 text-red-400",

  rejected: "bg-red-500/10 text-red-400",
};

export default function StatusBadge({ status }: Props) {
  return (
    <span
      className={`inline-flex rounded-full px-3 py-1 text-sm font-semibold ${
        styles[status]
      }`}
    >
      {status
        .replace(/_/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase())}
    </span>
  );
}