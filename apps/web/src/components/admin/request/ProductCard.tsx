"use client";

import ActionButton from "@/components/ui/ActionButton";

interface Props {
  item: {
    name: string;
    quantity: number;
    url?: string;
    unitPrice?: number;
    subtotal?: number;
  };
  editable?: boolean;
  onEdit?: () => void;
}

export default function ProductCard({
  item,
  editable = false,
  onEdit,
}: Props) {
  const quoted =
    item.unitPrice != null &&
    item.subtotal != null;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">

      {/* Product Name */}
      <h3 className="text-xl font-semibold text-white">
        📦 {item.name}
      </h3>

      <div className="mt-5 space-y-4">

        {/* Quantity */}
        <div className="flex justify-between">
          <span className="text-slate-400">
            Quantity
          </span>

          <span className="text-white font-medium">
            {item.quantity}
          </span>
        </div>

        {/* Product Link */}
        {item.url && (
          <div>
            <p className="text-slate-400 mb-1">
              Product Link
            </p>

            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-purple-400 hover:text-purple-300 underline break-all"
            >
              View Product →
            </a>
          </div>
        )}

        {/* Quote Info */}
        {quoted ? (
          <>
            <div className="border-t border-slate-800 pt-4 space-y-3">

              <div className="flex justify-between">
                <span className="text-slate-400">
                  Unit Price
                </span>

                <span className="text-green-400 font-semibold">
                  ${item.unitPrice!.toFixed(2)}
                </span>
              </div>

              <div className="flex justify-between">
                <span className="text-slate-400">
                  Subtotal
                </span>

                <span className="text-white font-semibold">
                  ${item.subtotal!.toFixed(2)}
                </span>
              </div>

            </div>
          </>
        ) : (
          <div className="border-t border-slate-800 pt-4">
            <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-4">
              <p className="text-yellow-400 font-medium">
                Quote has not been created yet.
              </p>

              <p className="text-sm text-slate-400 mt-1">
                Product pricing will appear here after the quote is generated.
              </p>
            </div>
          </div>
        )}

      </div>

      {editable && (
        <div className="mt-6">
          <ActionButton
            className="w-full"
            onClick={onEdit}
          >
            Edit Product
          </ActionButton>
        </div>
      )}

    </div>
  );
}