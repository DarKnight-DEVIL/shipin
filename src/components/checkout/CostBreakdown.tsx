"use client";

import type { PaymentCalculation } from "@/features/finance/calculatePayment";

interface Props {
  payment: PaymentCalculation;
}

export default function CostBreakdown({ payment }: Props) {
  const { breakdown, walletApplied, paypalAmount } = payment;

  return (
    <section className="app-panel overflow-hidden">
      {/* Header */}
      <div className="border-b border-[var(--border)] px-5 py-3.5">
        <h2 className="text-[13px] font-semibold text-[var(--foreground)]">
          Payment summary
        </h2>
        <p className="mt-0.5 text-[12px] text-[var(--muted)]">
          Transparent pricing with no hidden charges.
        </p>
      </div>

      {/* Breakdown */}
      <div className="divide-y divide-[var(--border)] px-5">
        <PriceRow title="Products" value={breakdown.productsTotal} />

        <PriceRow
          title="Domestic shipping"
          value={breakdown.domesticShipping}
        />

        <PriceRow
          title="International shipping"
          value={breakdown.internationalShipping}
        />

        <PriceRow title="Service fee" value={breakdown.serviceFee} />

        {breakdown.inspectionFee !== undefined &&
          breakdown.inspectionFee > 0 && (
            <PriceRow
              title="Inspection fee"
              value={breakdown.inspectionFee}
            />
          )}

        {breakdown.holdFee !== undefined && breakdown.holdFee > 0 && (
          <PriceRow
            title="Storage / hold fee"
            value={breakdown.holdFee}
          />
        )}

        {walletApplied > 0 && (
          <PriceRow
            title="Wallet applied"
            value={-walletApplied}
            credit
          />
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-[var(--border)] p-5">
        <div className="rounded-[14px] bg-[#0b1220] p-5 text-white ring-1 ring-white/10 dark:bg-[#101a2b]">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/45">
                Total amount due
              </p>
              <p className="mt-2 text-[32px] font-semibold leading-none tracking-[-0.02em] tabular-nums">
                ${paypalAmount.toFixed(2)}
              </p>
            </div>

            <span className="rounded-md bg-white/10 px-2 py-1 text-[11px] font-semibold tracking-[0.08em] text-white/70">
              USD
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}

function PriceRow({
  title,
  value,
  credit = false,
}: {
  title: string;
  value: number;
  credit?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-3.5 text-[13px]">
      <span className="text-[var(--muted)]">{title}</span>
      <span
        className={`font-semibold tabular-nums ${
          credit ? "text-emerald-600 dark:text-emerald-400" : "text-[var(--foreground)]"
        }`}
      >
        {value < 0 ? "-" : ""}${Math.abs(value).toFixed(2)}
      </span>
    </div>
  );
}
