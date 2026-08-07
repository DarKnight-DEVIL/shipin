"use client";

import {
  Receipt,
  Package,
  Truck,
  Globe,
  Shield,
  Clock3,
  CreditCard,
} from "lucide-react";
import type { PaymentCalculation } from "@/features/finance/calculatePayment";

interface Props {
  payment: PaymentCalculation;
}

export default function CostBreakdown({ payment }: Props) {
  const { breakdown, walletApplied, paypalAmount } = payment;

  return (
    <section className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm dark:shadow-none hover:shadow-md transition-all duration-200">
      {/* Header */}
      <div className="border-b border-slate-200 dark:border-slate-800 p-8">
        <div className="flex items-center gap-3">
          <Receipt
            className="text-blue-600 dark:text-blue-400"
            size={24}
          />
          <div>
            <h2 className="text-2xl font-bold">
              Payment Summary
            </h2>
            <p className="text-sm text-slate-400">
              Transparent pricing with no hidden charges.
            </p>
          </div>
        </div>
      </div>

      {/* Breakdown */}
      <div className="space-y-3 p-8">
        <PriceRow
          icon={<Package size={18} />}
          title="Products"
          value={breakdown.productsTotal}
        />

        <PriceRow
          icon={<Truck size={18} />}
          title="Domestic Shipping"
          value={breakdown.domesticShipping}
        />

        <PriceRow
          icon={<Globe size={18} />}
          title="International Shipping"
          value={breakdown.internationalShipping}
        />

        <PriceRow
          icon={<Shield size={18} />}
          title="Service Fee"
          value={breakdown.serviceFee}
        />

        {breakdown.inspectionFee !== undefined &&
          breakdown.inspectionFee > 0 && (
            <PriceRow
              icon={<Shield size={18} />}
              title="Inspection Fee"
              value={breakdown.inspectionFee}
            />
          )}

        {breakdown.holdFee !== undefined &&
          breakdown.holdFee > 0 && (
            <PriceRow
              icon={<Clock3 size={18} />}
              title="Storage / Hold Fee"
              value={breakdown.holdFee}
            />
          )}

        {walletApplied > 0 && (
          <PriceRow
            icon={<CreditCard size={18} />}
            title="Wallet Applied"
            value={-walletApplied}
            green
          />
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-slate-200 dark:border-slate-800 p-8">
        <div className="rounded-3xl bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 p-8 shadow-lg text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-blue-100">
                Total Amount Due
              </p>
              <h2 className="mt-3 text-5xl font-extrabold tracking-tight">
                ${paypalAmount.toFixed(2)}
              </h2>
            </div>

            <div className="rounded-xl bg-white/10 px-4 py-2">
              <p className="text-xs uppercase tracking-widest text-white">
                USD
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function PriceRow({
  icon,
  title,
  value,
  green,
}: {
  icon: React.ReactNode;
  title: string;
  value: number;
  green?: boolean;
}) {
  return (
    <div className="flex items-center justify-between rounded-xl bg-slate-50 dark:bg-slate-950/40 p-4">
      <div className="flex items-center gap-3">
        <div className="text-blue-600 dark:text-blue-400">
          {icon}
        </div>
        <span className="text-slate-700 dark:text-slate-300">
          {title}
        </span>
      </div>

      <span
        className={`font-semibold ${
          green
            ? "text-green-600 dark:text-green-400"
            : "text-slate-900 dark:text-white"
        }`}
      >
        {value < 0 ? "-" : ""}$
        {Math.abs(value).toFixed(2)}
      </span>
    </div>
  );
}