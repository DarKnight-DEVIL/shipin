"use client";

import {
  REQUEST_STATUS,
  type RequestStatus,
} from "@/lib/requestStatus";

interface Props {
  status: RequestStatus;
}

const TIMELINE: RequestStatus[] = [
  REQUEST_STATUS.submitted,
  REQUEST_STATUS.review,
  REQUEST_STATUS.awaiting_payment,
  REQUEST_STATUS.paid,
  REQUEST_STATUS.purchased,
  REQUEST_STATUS.warehouse_received,
  REQUEST_STATUS.ready_for_international_shipping,
  REQUEST_STATUS.packed,
  REQUEST_STATUS.shipped,
  REQUEST_STATUS.out_for_delivery,
  REQUEST_STATUS.delivered,
];

const timelineLabels: Record<RequestStatus, string> = {
  [REQUEST_STATUS.submitted]: "Request Received",

  [REQUEST_STATUS.review]: "Quote Ready",

  [REQUEST_STATUS.awaiting_payment]: "Awaiting Payment",

  [REQUEST_STATUS.paid]: "Payment Confirmed",

  [REQUEST_STATUS.purchased]: "Items Purchased",

  [REQUEST_STATUS.warehouse_received]:
    "Arrived at Warehouse",

  [REQUEST_STATUS.ready_for_international_shipping]:
    "Ready For International Shipment",

  [REQUEST_STATUS.packed]: "Packed",

  [REQUEST_STATUS.shipped]: "Shipped",

  [REQUEST_STATUS.out_for_delivery]:
    "Out For Delivery",

  [REQUEST_STATUS.delivered]: "Delivered",

  [REQUEST_STATUS.refunded]: "Refunded",
};

export default function RequestTimeline({
  status,
}: Props) {
  const currentIndex =
    status === REQUEST_STATUS.refunded
      ? -1
      : TIMELINE.indexOf(status);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
      <h2 className="text-2xl font-semibold text-white mb-6">
        Shipment Progress
      </h2>

      <div className="space-y-4">
        {TIMELINE.map((step, index) => {
          const completed = index <= currentIndex;

          const active = index === currentIndex;

          return (
            <div
              key={step}
              className="flex items-center gap-4"
            >
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                  completed
                    ? "bg-green-500 text-white"
                    : "bg-slate-800 text-slate-500"
                }`}
              >
                {completed ? "✓" : index + 1}
              </div>

              <div>
                <div
                  className={`font-medium ${
                    completed
                      ? "text-white"
                      : "text-slate-500"
                  } ${
                    active ? "text-green-400" : ""
                  }`}
                >
                  {timelineLabels[step]}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}