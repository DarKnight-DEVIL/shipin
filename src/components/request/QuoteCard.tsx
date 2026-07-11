"use client";

import type { Quote } from "@/types/request";

interface Props {
  quote?: Quote;
}

export default function QuoteCard({ quote }: Props) {
  if (!quote) return null;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 mb-8">
      <h2 className="text-2xl font-semibold text-white mb-6">
        Purchase Invoice
      </h2>

      <div className="space-y-4">
        <Row
          label="Products Total"
          value={quote.breakdown?.productsTotal}
        />

        <Row
          label="Domestic Shipping"
          value={quote.breakdown?.domesticShipping}
        />

        <Row
          label="Estimated International Shipping"
          value={quote.breakdown?.internationalShipping}
        />

        <Row
          label="ShipIN Service Fee"
          value={quote.breakdown?.serviceFee}
        />

        <div className="border-t border-slate-700 pt-5 mt-5">
          <div className="flex justify-between items-center">
            <span className="text-xl font-bold text-white">
              Estimated Total
            </span>

            <span className="text-3xl font-bold text-green-400">
              ${(quote.breakdown?.grandTotal ?? 0).toFixed(2)}
            </span>
          </div>
        </div>
      </div>

      <div className="mt-6 rounded-xl border border-yellow-500/20 bg-yellow-500/5 p-4">
        <p className="text-yellow-400 font-semibold">
          Shipping Estimate
        </p>

        <p className="text-slate-400 text-sm mt-2 leading-6">
          International shipping is estimated.
          Final shipping charges will be confirmed
          after your package reaches the ShipIN warehouse.
        </p>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
}: {
  label: string;
  value?: number;
}) {
  return (
    <div className="flex justify-between">
      <span className="text-slate-400">
        {label}
      </span>

      <span className="text-white font-semibold">
        ${(value ?? 0).toFixed(2)}
      </span>
    </div>
  );
}