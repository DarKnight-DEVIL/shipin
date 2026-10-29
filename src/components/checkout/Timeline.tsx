"use client";

import {
  CheckCircle2,
  CreditCard,
  ShoppingBag,
  Warehouse,
  Truck,
  PackageCheck,
} from "lucide-react";

const steps = [
  {
    title: "Quote",
    icon: CheckCircle2,
    completed: true,
    active: false,
  },
  {
    title: "Payment",
    icon: CreditCard,
    completed: false,
    active: true,
  },
  {
    title: "Purchasing",
    icon: ShoppingBag,
    completed: false,
    active: false,
  },
  {
    title: "Warehouse",
    icon: Warehouse,
    completed: false,
    active: false,
  },
  {
    title: "Shipping",
    icon: Truck,
    completed: false,
    active: false,
  },
  {
    title: "Delivered",
    icon: PackageCheck,
    completed: false,
    active: false,
  },
];

export default function Timeline() {
  return (
    <section className="app-panel overflow-hidden">
      <div className="border-b border-[var(--border)] px-5 py-3.5">
        <h2 className="text-[13px] font-semibold text-[var(--foreground)]">
          Order progress
        </h2>
        <p className="mt-0.5 text-[12px] text-[var(--muted)]">
          What happens after this payment.
        </p>
      </div>

      <div className="overflow-x-auto">
        <div className="flex min-w-[800px] px-6 py-7">
          {steps.map((step, index) => {
            const Icon = step.icon;
            const isLast = index === steps.length - 1;

            return (
              <div
                key={step.title}
                className="relative flex flex-1 flex-col items-center"
              >
                {!isLast && (
                  <div
                    className={`absolute left-1/2 top-[18px] h-px w-full ${
                      step.completed
                        ? "bg-emerald-500/70"
                        : "bg-[var(--border)]"
                    }`}
                    aria-hidden
                  />
                )}

                <div
                  className={`relative z-10 flex h-9 w-9 items-center justify-center rounded-full border transition-colors ${
                    step.completed
                      ? "border-emerald-500 bg-emerald-500 text-white"
                      : step.active
                        ? "border-[var(--accent-solid)] bg-[var(--accent-solid)] text-white"
                        : "border-[var(--border)] bg-[var(--surface-2)] text-[var(--muted)]"
                  }`}
                >
                  <Icon size={15} strokeWidth={2.25} />
                </div>

                <p
                  className={`mt-3 text-[12px] ${
                    step.completed
                      ? "font-medium text-emerald-700 dark:text-emerald-400"
                      : step.active
                        ? "font-semibold text-[var(--foreground)]"
                        : "text-[var(--muted)]"
                  }`}
                >
                  {step.title}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
