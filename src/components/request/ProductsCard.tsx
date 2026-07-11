"use client";

import type { RequestItem, Quote } from "@/types/request";

interface Props {
  items: RequestItem[];
  quote?: Quote;
}

export default function ProductsCard({
  items,
  quote,
}: Props) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 mb-8">

      <h2 className="text-2xl font-semibold text-white mb-6">
        Products
      </h2>

      <div className="space-y-6">

        {items.map((item, index) => {

          const quoteItem = quote?.items?.[index];

          return (

            <div
              key={index}
              className="rounded-xl border border-slate-800 p-5"
            >

              <div className="flex justify-between">

                <div>

                  <h3 className="text-xl font-semibold text-white">
                    {item.name}
                  </h3>

                  <p className="text-slate-400 mt-2">
                    Quantity: {item.quantity}
                  </p>

                  {item.url && (
                    <>
                      <p className="text-slate-500 text-sm break-all mt-3">
                        {item.url}
                      </p>

                      <a
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex mt-3 rounded-lg bg-purple-600 hover:bg-purple-700 px-4 py-2 text-sm font-medium text-white"
                      >
                        View Product
                      </a>
                    </>
                  )}

                </div>

                {quoteItem && (

                  <div className="w-64 rounded-xl bg-slate-800 p-4">

                    <PriceRow
                      label="Unit Price"
                      value={quoteItem.unitPrice}
                    />

                    <PriceRow
                      label="Quantity"
                      value={quoteItem.quantity}
                      money={false}
                    />

                    <hr className="border-slate-700 my-3"/>

                    <PriceRow
                      label="Subtotal"
                      value={quoteItem.subtotal}
                      highlight
                    />

                  </div>

                )}

              </div>

            </div>

          );
        })}

      </div>

    </div>
  );
}

function PriceRow({
  label,
  value,
  highlight = false,
  money = true,
}: {
  label: string;
  value?: number;
  highlight?: boolean;
  money?: boolean;
}) {
  return (
    <div className="flex justify-between py-2">

      <span className="text-slate-400">
        {label}
      </span>

      <span
        className={`font-semibold ${
          highlight
            ? "text-green-400"
            : "text-white"
        }`}
      >
        {money
          ? `$${(value ?? 0).toFixed(2)}`
          : value ?? "-"}
      </span>

    </div>
  );
}