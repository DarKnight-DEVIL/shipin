"use client";

import {
  REQUEST_STATUS,
  type RequestStatus,
} from "@/lib/requestStatus";

import type {
  StatusHistory,
  OrderChangeInfo,
} from "@/types/request";

interface Props {
  status: RequestStatus;
  history?: StatusHistory;
  orderChange?: OrderChangeInfo;
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

const timelineLabels: Record<
  RequestStatus,
  string
> = {
  [REQUEST_STATUS.submitted]:
    "Request Received",

  [REQUEST_STATUS.review]:
    "Quote Ready",

  [REQUEST_STATUS.awaiting_payment]:
    "Awaiting Payment",

  [REQUEST_STATUS.paid]:
    "Payment Confirmed",

  [REQUEST_STATUS.purchased]:
    "Items Purchased",

  [REQUEST_STATUS.warehouse_received]:
    "Arrived at Warehouse",

  [REQUEST_STATUS.ready_for_international_shipping]:
    "Ready For International Shipment",

  [REQUEST_STATUS.packed]:
    "Packed",

  [REQUEST_STATUS.shipped]:
    "Shipped",

  [REQUEST_STATUS.out_for_delivery]:
    "Out For Delivery",

  [REQUEST_STATUS.delivered]:
    "Delivered",

  [REQUEST_STATUS.refunded]:
    "Refunded",
};

export default function RequestTimeline({
  status,
  history,
  orderChange,
}: Props) {
  const currentIndex =
    status === REQUEST_STATUS.refunded
      ? -1
      : TIMELINE.indexOf(status);

  /*
   * Additional-item requests can pause the
   * shipment without changing request.status.
   */
  const waitingForAdditionalItems =
    orderChange?.active === true;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:shadow-none">

      {/* HEADER */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">

        <div>
          <h2 className="text-2xl font-semibold text-slate-950 dark:text-white">
            Shipment Progress
          </h2>

          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Track the progress of your
            complete ShipIN order.
          </p>
        </div>

        {/* TEMPORARY ORDER HOLD */}
        {waitingForAdditionalItems && (
          <div className="shrink-0 rounded-full border border-amber-500/30 bg-amber-500/10 px-4 py-2">

            <span className="text-sm font-semibold text-amber-700 dark:text-amber-300">
              Waiting for Additional Items
            </span>

          </div>
        )}

      </div>

      {/* ADDITIONAL ITEM HOLD MESSAGE */}
      {waitingForAdditionalItems && (
        <div className="mt-6 rounded-xl border border-amber-500/20 bg-amber-500/5 p-5">

          <div className="flex gap-3">

            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-500/10 font-bold text-amber-700 dark:text-amber-300">
              !
            </div>

            <div>

              <h3 className="font-semibold text-amber-700 dark:text-amber-300">
                Shipment temporarily paused
              </h3>

              <p className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-400">
                Your shipment is waiting
                for one or more additional
                requested items. The
                shipment will continue once
                the additional items are
                received and packed.
              </p>

              {orderChange?.requiresRepacking && (
                <p className="mt-2 text-sm text-slate-500 dark:text-slate-500">
                  Your original parcel was
                  already packed, so it will
                  be repacked together with
                  the additional item.
                </p>
              )}

            </div>

          </div>

        </div>
      )}

      {/* MAIN TIMELINE */}
      <div className="mt-7 space-y-4">

        {TIMELINE.map(
          (step, index) => {
            const completed =
              index <= currentIndex;

            const active =
              index === currentIndex;

            return (
              <div
                key={step}
                className="flex items-center gap-4"
              >

                {/* STEP INDICATOR */}
                <div
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                    completed
                      ? "bg-green-500 text-white"
                      : "bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500"
                  }`}
                >
                  {completed
                    ? "✓"
                    : index + 1}
                </div>

                {/* STEP INFORMATION */}
                <div>

                  <div
                    className={`font-medium ${
                      active
                        ? "text-green-600 dark:text-green-400"
                        : completed
                          ? "text-slate-950 dark:text-white"
                          : "text-slate-400 dark:text-slate-500"
                    }`}
                  >
                    {timelineLabels[step]}
                  </div>

                  {history?.[step] && (
                    <p className="mt-1 text-xs text-slate-500">
                      {history[step]
                        ?.toDate()
                        .toLocaleString()}
                    </p>
                  )}

                  {active &&
                    waitingForAdditionalItems && (
                      <p className="mt-1 text-xs font-medium text-amber-600 dark:text-amber-400">
                        Paused while waiting
                        for additional items
                      </p>
                    )}

                </div>

              </div>
            );
          }
        )}

      </div>

    </div>
  );
}