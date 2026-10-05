"use client";

import {
  REQUEST_STATUS,
  type RequestStatus,
} from "@/lib/requestStatus";

import type {
  StatusHistory,
  OrderChangeInfo,
  PartialRefund,
} from "@/types/request";

interface RefundRequestInfo {
  status?: "requested" | "processing" | "completed";
  preference?: "wallet" | "original_payment" | "original_sources";
  amount?: number;
  requestedAt?: any;
  processedAt?: any;
  paypalRefundTransactionId?: string;
}

interface Props {
  status: RequestStatus;
  history?: StatusHistory;
  orderChange?: OrderChangeInfo;
  refundRequest?: RefundRequestInfo;
  partialRefunds?: PartialRefund[];
}

type TimelineStep =
  | RequestStatus
  | "refund_requested"
  | "refund_offered";

const TIMELINE: TimelineStep[] = [
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

const REFUND_TIMELINE: TimelineStep[] = [
  REQUEST_STATUS.submitted,
  REQUEST_STATUS.review,
  REQUEST_STATUS.awaiting_payment,
  REQUEST_STATUS.paid,
  "refund_requested",
];

const REFUNDED_TIMELINE: TimelineStep[] = [
  REQUEST_STATUS.submitted,
  REQUEST_STATUS.review,
  REQUEST_STATUS.awaiting_payment,
  REQUEST_STATUS.paid,
  "refund_requested",
  REQUEST_STATUS.refunded,
];

const REJECTED_TIMELINE: TimelineStep[] = [
  REQUEST_STATUS.submitted,
  REQUEST_STATUS.rejected,
];

const timelineLabels: Record<TimelineStep, string> = {
  [REQUEST_STATUS.submitted]: "Received",
  [REQUEST_STATUS.review]: "Quote Ready",
  [REQUEST_STATUS.awaiting_payment]: "Awaiting Pay",
  [REQUEST_STATUS.paid]: "Paid",
  [REQUEST_STATUS.refund_offered]: "Refund Offered",
  [REQUEST_STATUS.refund_requested]: "Refund Requested",
  [REQUEST_STATUS.purchased]: "Purchased",
  [REQUEST_STATUS.warehouse_received]: "Warehouse",
  [REQUEST_STATUS.ready_for_international_shipping]: "Ready to Ship",
  [REQUEST_STATUS.packed]: "Packed",
  [REQUEST_STATUS.shipped]: "Shipped",
  [REQUEST_STATUS.out_for_delivery]: "Out for Delivery",
  [REQUEST_STATUS.delivered]: "Delivered",
  [REQUEST_STATUS.refunded]: "Refunded",
  [REQUEST_STATUS.rejected]: "Rejected",
};

export default function RequestTimeline({
  status,
  history,
  orderChange,
  refundRequest,
  partialRefunds,
}: Props) {
  const isRejected = status === REQUEST_STATUS.rejected;

  const refundRequested =
    status === REQUEST_STATUS.refund_requested ||
    refundRequest?.status === "requested";

  const refundProcessing = refundRequest?.status === "processing";

  const refundCompleted =
    status === REQUEST_STATUS.refunded ||
    refundRequest?.status === "completed";

  let timeline: TimelineStep[];

  if (isRejected) {
    timeline = REJECTED_TIMELINE;
  } else if (refundCompleted) {
    timeline = REFUNDED_TIMELINE;
  } else if (refundRequested || refundProcessing) {
    timeline = REFUND_TIMELINE;
  } else {
    timeline = TIMELINE;
  }

  let currentTimelineStep: TimelineStep = status;

  if (refundRequested || refundProcessing) {
    currentTimelineStep = "refund_requested";
  }

  if (refundCompleted) {
    currentTimelineStep = REQUEST_STATUS.refunded;
  }

  const currentIndex = timeline.indexOf(currentTimelineStep);
  const waitingForAdditionalItems = orderChange?.active === true;

  function formatTimestamp(timestamp: any) {
    if (!timestamp) return null;
    try {
      if (typeof timestamp.toDate === "function") {
        return timestamp.toDate().toLocaleString();
      }
      return new Date(timestamp).toLocaleString();
    } catch {
      return null;
    }
  }

  function stepClasses(index: number, step: TimelineStep) {
    const completed =
      index < currentIndex || (isRejected && index === 0);
    const active = index === currentIndex;
    const rejectedStep =
      isRejected && step === REQUEST_STATUS.rejected;
    const refundStep = step === "refund_requested";
    const refundedStep = step === REQUEST_STATUS.refunded;

    if (rejectedStep || refundStep) {
      return {
        dot: "border border-red-500/40 bg-red-500/10 text-red-400",
        label: "text-red-400",
        line: "bg-red-500/30",
      };
    }
    if (refundedStep) {
      return {
        dot: "bg-emerald-500 text-white",
        label: "text-emerald-400",
        line: "bg-emerald-500/60",
      };
    }
    if (completed) {
      return {
        dot: "bg-emerald-500 text-white",
        label: "text-slate-700 dark:text-slate-200",
        line: "bg-emerald-500/60",
      };
    }
    if (active) {
      return {
        dot: "bg-purple-500/20 text-purple-300 ring-2 ring-purple-500/40",
        label: "text-purple-300",
        line: "bg-slate-700",
      };
    }
    return {
      dot: "bg-slate-200 text-slate-400 dark:bg-slate-800 dark:text-slate-500",
      label: "text-slate-400 dark:text-slate-500",
      line: "bg-slate-200 dark:bg-slate-800",
    };
  }

  return (
    <section className="shipin-surface px-4 py-5 sm:px-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-medium text-slate-800 dark:text-slate-100">
            Progress
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            {timelineLabels[currentTimelineStep]}
            {waitingForAdditionalItems &&
              !isRejected &&
              !refundRequested &&
              !refundCompleted &&
              " · Paused for additional items"}
          </p>
        </div>

        {isRejected && (
          <span className="rounded-full border border-red-500/30 bg-red-500/10 px-3 py-1 text-xs font-semibold text-red-400">
            Rejected
          </span>
        )}
        {!isRejected && !refundCompleted && refundRequested && (
          <span className="rounded-full border border-red-500/30 bg-red-500/10 px-3 py-1 text-xs font-semibold text-red-400">
            Refund requested
          </span>
        )}
        {!isRejected && refundCompleted && (
          <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-400">
            Refunded
          </span>
        )}
        {!isRejected &&
          !refundRequested &&
          !refundProcessing &&
          !refundCompleted &&
          waitingForAdditionalItems && (
            <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-300">
              Waiting for items
            </span>
          )}
      </div>

      {/* Alert banners */}
      {isRejected && (
        <div className="mb-5 rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-slate-400">
          This purchase request could not be processed. See the rejection
          reason above.
        </div>
      )}

      {!isRejected && refundRequested && (
        <div className="mb-5 rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-slate-400">
          Refund request submitted
          {refundRequest?.preference && (
            <span className="mt-1 block text-xs text-red-400/80">
              Preference:{" "}
              {refundRequest.preference === "wallet"
                ? "ShipIN Wallet"
                : refundRequest.preference === "original_payment"
                  ? "Original payment method"
                  : "Original payment sources"}
            </span>
          )}
        </div>
      )}

      {!isRejected &&
        !refundRequested &&
        !refundProcessing &&
        !refundCompleted &&
        waitingForAdditionalItems && (
          <div className="mb-5 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-sm text-slate-400">
            Shipment is paused while additional items are handled.
            {orderChange?.requiresRepacking && (
              <span className="mt-1 block text-xs text-slate-500">
                Original parcel will be repacked with the new item.
              </span>
            )}
          </div>
        )}

      {/* Desktop horizontal */}
      <ol className="hidden md:flex md:items-start">
        {timeline.map((step, index) => {
          const c = stepClasses(index, step);
          const completed =
            index < currentIndex || (isRejected && index === 0);
          const active = index === currentIndex;
          const rejectedStep =
            isRejected && step === REQUEST_STATUS.rejected;
          const refundStep = step === "refund_requested";

          return (
            <li key={step} className="flex min-w-0 flex-1 items-start">
              <div className="flex w-full flex-col items-center">
                <div
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${c.dot}`}
                >
                  {rejectedStep || refundStep
                    ? "!"
                    : completed
                      ? "✓"
                      : index + 1}
                </div>
                <span
                  className={`mt-2 max-w-[4.5rem] text-center text-[10px] leading-tight ${c.label}`}
                >
                  {timelineLabels[step]}
                </span>
              </div>
              {index < timeline.length - 1 && (
                <div
                  className={`mt-3.5 h-px min-w-[8px] flex-1 ${
                    index < currentIndex ? c.line : "bg-slate-200 dark:bg-slate-800"
                  }`}
                />
              )}
            </li>
          );
        })}
      </ol>

      {/* Mobile vertical — show completed + current + next only when long */}
      <ol className="space-y-0 md:hidden">
        {timeline.map((step, index) => {
          const c = stepClasses(index, step);
          const completed =
            index < currentIndex || (isRejected && index === 0);
          const active = index === currentIndex;
          const rejectedStep =
            isRejected && step === REQUEST_STATUS.rejected;
          const refundStep = step === "refund_requested";
          const refundedStep = step === REQUEST_STATUS.refunded;

          const stepTimestamp = refundStep
            ? refundRequest?.requestedAt
            : refundedStep
              ? refundRequest?.processedAt
              : history?.[step as RequestStatus];

          const formatted = formatTimestamp(stepTimestamp);

          // Collapse far-future steps on mobile for long timelines
          if (
            timeline.length > 6 &&
            index > currentIndex + 1 &&
            index < timeline.length - 1
          ) {
            return null;
          }

          return (
            <li key={step} className="relative flex gap-3 pb-5 last:pb-0">
              {index < timeline.length - 1 && (
                <div
                  className={`absolute left-[13px] top-7 bottom-0 w-px ${
                    index < currentIndex
                      ? "bg-emerald-500/50"
                      : "bg-slate-200 dark:bg-slate-800"
                  }`}
                />
              )}
              <div
                className={`relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${c.dot}`}
              >
                {rejectedStep || refundStep
                  ? "!"
                  : completed || refundedStep
                    ? "✓"
                    : index + 1}
              </div>
              <div className="min-w-0 pt-0.5">
                <p className={`text-sm font-medium ${c.label}`}>
                  {timelineLabels[step]}
                </p>
                {formatted && (
                  <p className="mt-0.5 text-xs text-slate-500">{formatted}</p>
                )}
                {active &&
                  !isRejected &&
                  !refundStep &&
                  waitingForAdditionalItems && (
                    <p className="mt-0.5 text-xs font-medium text-amber-400">
                      Paused for additional items
                    </p>
                  )}
              </div>
            </li>
          );
        })}
      </ol>

      {/* Partial refunds */}
      {partialRefunds && partialRefunds.length > 0 && (
        <div className="mt-6 border-t border-slate-200 pt-5 dark:border-slate-800">
          <p className="shipin-section-label mb-3">Refund history</p>
          <div className="space-y-3">
            {partialRefunds.map((refund) => {
              const ts = formatTimestamp(refund.createdAt);
              return (
                <div key={refund.id} className="flex gap-3">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-500 text-xs font-bold text-white">
                    $
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-amber-500">
                      Partial refund · ${Number(refund.amount).toFixed(2)}
                    </p>
                    {refund.reason && (
                      <p className="mt-0.5 text-sm text-slate-500">
                        {refund.reason}
                      </p>
                    )}
                    {ts && (
                      <p className="mt-0.5 text-xs text-slate-500">{ts}</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}