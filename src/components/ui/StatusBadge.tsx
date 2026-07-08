"use client";

interface Props {
  status: string;
}

const STATUS_STYLES: Record<
  string,
  string
> = {
  submitted:
    "bg-blue-500/20 text-blue-400",

  review:
    "bg-indigo-500/20 text-indigo-400",

  payment:
    "bg-yellow-500/20 text-yellow-400",

  paid:
    "bg-green-500/20 text-green-400",

  purchased:
    "bg-purple-500/20 text-purple-400",

  warehouse_received:
    "bg-cyan-500/20 text-cyan-400",

  packed:
    "bg-orange-500/20 text-orange-400",

  shipped:
    "bg-sky-500/20 text-sky-400",

  out_for_delivery:
    "bg-teal-500/20 text-teal-400",

  delivered:
    "bg-emerald-500/20 text-emerald-400",

  refunded:
    "bg-red-500/20 text-red-400",
};

export default function StatusBadge({
  status,
}: Props) {
  return (
    <span
      className={`px-3 py-1 rounded-full text-sm font-semibold ${
        STATUS_STYLES[status] ??
        "bg-slate-700 text-slate-300"
      }`}
    >
      {status
        .replace(/_/g, " ")
        .replace(/\b\w/g, (c) =>
          c.toUpperCase()
        )}
    </span>
  );
}