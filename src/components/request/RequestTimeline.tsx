"use client";

import { Check } from "lucide-react";

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
  [REQUEST_STATUS.review]: "Quote ready",
  [REQUEST_STATUS.awaiting_payment]: "Awaiting payment",
  [REQUEST_STATUS.paid]: "Paid",
  [REQUEST_STATUS.refund_offered]: "Refund offered",
  [REQUEST_STATUS.refund_requested]: "Refund requested",
  [REQUEST_STATUS.purchased]: "Purchased",
  [REQUEST_STATUS.warehouse_received]: "Warehouse",
  [REQUEST_STATUS.ready_for_international_shipping]: "Ready to ship",
  [REQUEST_STATUS.packed]: "Packed",
  [REQUEST_STATUS.shipped]: "Shipped",
  [REQUEST_STATUS.out_for_delivery]: "Out for delivery",
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
    const deliveredStep =
      step === REQUEST_STATUS.delivered && (active || completed);

    if (rejectedStep || refundStep) {
      return {
        dot: "border border-rose-300 bg-rose-50 text-rose-600 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-300",
        label: "text-rose-600 dark:text-rose-400",
        line: "bg-rose-200 dark:bg-rose-500/30",
      };
    }

    if (refundedStep || deliveredStep) {
      return {
        dot: "border border-transparent bg-emerald-500 text-white",
        label: "text-emerald-700 dark:text-emerald-400",
        line: "bg-emerald-500/40",
      };
    }

    if (completed) {
      return {
        dot: "border border-transparent bg-[var(--foreground)] text-[var(--card)]",
        label: "text-[var(--foreground)]",
        line: "bg-[var(--foreground)]/25",
      };
    }

    if (active) {
      return {
        dot: "border border-[var(--accent-solid)] bg-[var(--card)] text-[var(--accent)]",
        label: "font-medium text-[var(--accent)]",
        line: "bg-[var(--border)]",
      };
    }

    return {
      dot: "border border-[var(--border-strong)] bg-[var(--card)] text-[var(--muted)]",
      label: "text-[var(--muted)]",
      line: "bg-[var(--border)]",
    };
  }

  const statusTone = isRejected
    ? "text-rose-600 dark:text-rose-400"
    : refundCompleted
      ? "text-emerald-700 dark:text-emerald-400"
      : refundRequested
        ? "text-rose-600 dark:text-rose-400"
        : "text-[var(--muted)]";

  return (
    <section className="app-panel px-5 py-5 sm:px-6">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="app-section-title">Progress</h2>
          <p className="mt-0.5 text-[12px] text-[var(--muted)]">
            {timelineLabels[currentTimelineStep]}
            {waitingForAdditionalItems &&
              !isRejected &&
              !refundRequested &&
              !refundCompleted &&
              " · paused for additional items"}
          </p>
        </div>

        <span className={`text-[11px] font-medium ${statusTone}`}>
          {isRejected
            ? "Rejected"
            : refundCompleted
              ? "Refunded"
              : refundRequested
                ? "Refund requested"
                : waitingForAdditionalItems
                  ? "Waiting for items"
                  : `${Math.max(currentIndex + 1, 0)} of ${timeline.length}`}
        </span>
      </div>

      {/* Alert banners */}
      {isRejected && (
        <div className="mb-5 rounded-lg border border-rose-200/80 bg-rose-50/70 px-3.5 py-2.5 text-[12px] text-rose-800 dark:border-rose-500/25 dark:bg-rose-500/10 dark:text-rose-200">
          This purchase request could not be processed. See the rejection
          reason above.
        </div>
      )}

      {!isRejected && refundRequested && (
        <div className="mb-5 rounded-lg border border-rose-200/80 bg-rose-50/70 px-3.5 py-2.5 text-[12px] text-rose-800 dark:border-rose-500/25 dark:bg-rose-500/10 dark:text-rose-200">
          Refund request submitted
          {refundRequest?.preference && (
            <span className="mt-0.5 block text-[11px] text-rose-600/80 dark:text-rose-300/80">
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
          <div className="mb-5 rounded-lg border border-amber-200/80 bg-amber-50/70 px-3.5 py-2.5 text-[12px] text-amber-800 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-200">
            Shipment is paused while additional items are handled.
            {orderChange?.requiresRepacking && (
              <span className="mt-0.5 block text-[11px] text-amber-700/80 dark:text-amber-300/80">
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
          const rejectedStep =
            isRejected && step === REQUEST_STATUS.rejected;
          const refundStep = step === "refund_requested";
          const refundedStep = step === REQUEST_STATUS.refunded;

          return (
            <li key={step} className="flex min-w-0 flex-1 items-start">
              <div className="flex w-full flex-col items-center">
                <div
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[9px] font-semibold ${c.dot}`}
                >
                  {rejectedStep || refundStep ? (
                    "!"
                  ) : completed || refundedStep ? (
                    <Check size={11} strokeWidth={3} />
                  ) : (
                    index + 1
                  )}
                </div>

                <span
                  className={`mt-2 max-w-[4.75rem] text-center text-[10px] leading-[13px] ${c.label}`}
                >
                  {timelineLabels[step]}
                </span>
              </div>

              {index < timeline.length - 1 && (
                <div
                  className={`mt-2.5 h-px min-w-[8px] flex-1 ${
                    index < currentIndex ? c.line : "bg-[var(--border)]"
                  }`}
                />
              )}
            </li>
          );
        })}
      </ol>

      {/* Mobile vertical — show completed + current + next only when long */}
      <ol className="md:hidden">
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

          if (
            timeline.length > 6 &&
            index > currentIndex + 1 &&
            index < timeline.length - 1
          ) {
            return null;
          }

          return (
            <li key={step} className="relative flex gap-3 pb-4 last:pb-0">
              {index < timeline.length - 1 && (
                <div
                  className={`absolute bottom-0 left-[9px] top-6 w-px ${
                    index < currentIndex
                      ? c.line
                      : "bg-[var(--border)]"
                  }`}
                />
              )}

              <div
                className={`relative z-10 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[9px] font-semibold ${c.dot}`}
              >
                {rejectedStep || refundStep ? (
                  "!"
                ) : completed || refundedStep ? (
                  <Check size={11} strokeWidth={3} />
                ) : (
                  index + 1
                )}
              </div>

              <div className="min-w-0 pt-px">
                <p className={`text-[12px] leading-5 ${c.label}`}>
                  {timelineLabels[step]}
                </p>

                {formatted && (
                  <p className="text-[11px] text-[var(--muted)]">
                    {formatted}
                  </p>
                )}

                {active &&
                  !isRejected &&
                  !refundStep &&
                  waitingForAdditionalItems && (
                    <p className="text-[11px] font-medium text-amber-700 dark:text-amber-400">
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
        <div className="mt-5 border-t border-[var(--border)] pt-4">
          <p className="app-kicker mb-3">Refund history</p>

          <div className="space-y-2.5">
            {partialRefunds.map((refund) => {
              const ts = formatTimestamp(refund.createdAt);

              return (
                <div key={refund.id} className="flex gap-2.5">
                  <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--surface-3)] text-[10px] font-semibold text-[var(--muted)]">
                    $
                  </div>

                  <div className="min-w-0">
                    <p className="text-[12px] font-medium text-[var(--foreground)]">
                      Partial refund · ${Number(refund.amount).toFixed(2)}
                    </p>

                    {refund.reason && (
                      <p className="mt-0.5 text-[12px] leading-5 text-[var(--muted)]">
                        {refund.reason}
                      </p>
                    )}

                    {ts && (
                      <p className="mt-0.5 text-[11px] text-[var(--muted-soft)]">
                        {ts}
                      </p>
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
