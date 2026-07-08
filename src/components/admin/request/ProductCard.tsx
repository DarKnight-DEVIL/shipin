"use client";

import ActionButton from "@/components/ui/ActionButton";
import { RequestItem } from "@/types/request";

interface Props {
  item: RequestItem;
  editable?: boolean;
  onEdit?: () => void;
}

export default function ProductCard({
  item,
  editable = false,
  onEdit,
}: Props) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">

      <h3 className="text-xl font-semibold text-white">
        {item.name}
      </h3>

      <div className="mt-4 space-y-3 text-sm">

        <div className="flex justify-between">
          <span className="text-slate-400">Quantity</span>
          <span className="text-white">{item.quantity}</span>
        </div>

        <div className="flex justify-between">
          <span className="text-slate-400">Unit Price</span>
          <span className="text-green-400">
            {item.unitPrice != null
              ? `$${item.unitPrice.toFixed(2)}`
              : "Pending"}
          </span>
        </div>

        <div className="flex justify-between">
          <span className="text-slate-400">Subtotal</span>
          <span className="text-white">
            {item.subtotal != null
              ? `$${item.subtotal.toFixed(2)}`
              : "Pending"}
          </span>
        </div>

        {item.url && (
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="block truncate text-purple-400 hover:underline"
          >
            View Product →
          </a>
        )}

      </div>

      {editable && (
        <div className="mt-6">
          <ActionButton
            onClick={onEdit}
            className="w-full"
          >
            Edit Product
          </ActionButton>
        </div>
      )}
    </div>
  );
}