"use client";

import {
  CheckCircle2,
  Circle,
  Clock3,
} from "lucide-react";

interface Props {
  status: string;
}

const steps = [
  {
    key: "submitted",
    label: "Request Submitted",
  },
  {
    key: "purchase_invoice_sent",
    label: "Purchase Invoice",
  },
  {
    key: "purchase_invoice_paid",
    label: "Payment",
  },
  {
    key: "items_ordered",
    label: "Items Ordered",
  },
  {
    key: "warehouse_received",
    label: "Warehouse",
  },
  {
    key: "shipping_invoice_sent",
    label: "Shipping Invoice",
  },
  {
    key: "shipping_invoice_paid",
    label: "Shipping Paid",
  },
  {
    key: "shipped",
    label: "Shipped",
  },
  {
    key: "delivered",
    label: "Delivered",
  },
];

export default function RequestProgress({
  status,
}: Props) {
  const currentIndex = steps.findIndex(
    (s) => s.key === status
  );

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">

      <h2 className="text-xl font-bold text-white mb-6">
        Order Progress
      </h2>

      <div className="space-y-5">

        {steps.map((step, index) => {
          const completed =
            index < currentIndex;

          const current =
            index === currentIndex;

          return (
            <div
              key={step.key}
              className="flex items-start gap-4"
            >

              {completed ? (
                <CheckCircle2
                  className="text-green-500 mt-1"
                  size={22}
                />
              ) : current ? (
                <Clock3
                  className="text-yellow-400 mt-1"
                  size={22}
                />
              ) : (
                <Circle
                  className="text-slate-600 mt-1"
                  size={22}
                />
              )}

              <div>

                <p
                  className={`font-medium ${
                    completed
                      ? "text-green-400"
                      : current
                      ? "text-yellow-400"
                      : "text-slate-500"
                  }`}
                >
                  {step.label}
                </p>

                {current && (
                  <p className="text-sm text-slate-500 mt-1">
                    Current Stage
                  </p>
                )}

              </div>

            </div>
          );
        })}

      </div>

    </div>
  );
}