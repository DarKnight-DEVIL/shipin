interface Props {
  status: string;
}

const colors: Record<string, string> = {
  submitted: "bg-yellow-500/20 text-yellow-400",
  review: "bg-orange-500/20 text-orange-400",
  payment: "bg-blue-500/20 text-blue-400",
  awaiting_payment: "bg-indigo-500/20 text-indigo-400",
  paid: "bg-green-500/20 text-green-400",
  purchased: "bg-cyan-500/20 text-cyan-400",
  warehouse_received: "bg-sky-500/20 text-sky-400",
  packed: "bg-purple-500/20 text-purple-400",
  shipped: "bg-violet-500/20 text-violet-400",
  out_for_delivery: "bg-pink-500/20 text-pink-400",
  delivered: "bg-slate-500/20 text-slate-300",
  refunded: "bg-red-500/20 text-red-400",
};

const labels: Record<string, string> = {
  submitted: "Submitted",
  review: "Review",
  payment: "Quote Ready",
  awaiting_payment: "Awaiting Payment",
  paid: "Paid",
  purchased: "Purchased",
  warehouse_received: "Warehouse",
  packed: "Packed",
  shipped: "Shipped",
  out_for_delivery: "Out for Delivery",
  delivered: "Delivered",
  refunded: "Refunded",
};

export default function StatusBadge({
  status,
}: Props) {
  return (
    <span
      className={`px-3 py-1 rounded-full text-xs font-semibold ${
        colors[status] ||
        "bg-slate-700 text-white"
      }`}
    >
      {labels[status] || status}
    </span>
  );
}