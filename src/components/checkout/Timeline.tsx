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
    <section className="rounded-3xl border border-slate-800 bg-slate-900/70 backdrop-blur-xl shadow-xl">

      <div className="border-b border-slate-800 p-6">
        <h2 className="text-2xl font-bold">
          Order Progress
        </h2>

        <p className="mt-2 text-sm text-slate-400">
          Track your shipment journey.
        </p>
      </div>

      <div className="overflow-x-auto">

        <div className="flex min-w-[850px] justify-between px-8 py-10">

          {steps.map((step, index) => {

            const Icon = step.icon;

            return (
              <div
                key={step.title}
                className="relative flex flex-col items-center flex-1"
              >
                {index !== steps.length - 1 && (
                  <div
                    className={`absolute top-6 left-1/2 w-full h-[2px]
                    ${
                      step.completed
                        ? "bg-green-500"
                        : "bg-slate-700"
                    }`}
                  />
                )}

                <div
                  className={`relative z-10 flex h-12 w-12 items-center justify-center rounded-full border transition

                  ${
                    step.completed
                      ? "border-green-500 bg-green-500 text-white"
                      : step.active
                      ? "border-blue-500 bg-blue-600 text-white"
                      : "border-slate-700 bg-slate-900 text-slate-400"
                  }
                  `}
                >
                  <Icon size={22} />
                </div>

                <p
                  className={`mt-4 text-sm font-medium

                  ${
                    step.completed
                      ? "text-green-400"
                      : step.active
                      ? "text-blue-400"
                      : "text-slate-400"
                  }
                  `}
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