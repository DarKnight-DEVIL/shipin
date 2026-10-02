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
  status?:
    | "requested"
    | "processing"
    | "completed";

  preference?:
    | "wallet"
    | "original_payment"
    | "original_sources";

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

/*
 * Normal shipment timeline.
 *
 * Refund Requested is intentionally NOT included
 * here because it is an alternate path, not a
 * shipment stage.
 */
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

/*
 * Timeline used when a refund is requested.
 */
const REFUND_TIMELINE: TimelineStep[] = [
  REQUEST_STATUS.submitted,

  REQUEST_STATUS.review,

  REQUEST_STATUS.awaiting_payment,

  REQUEST_STATUS.paid,

  "refund_requested",
];

/*
 * Timeline after the refund is completely
 * processed.
 */
const REFUNDED_TIMELINE: TimelineStep[] = [
  REQUEST_STATUS.submitted,

  REQUEST_STATUS.review,

  REQUEST_STATUS.awaiting_payment,

  REQUEST_STATUS.paid,

  "refund_requested",

  REQUEST_STATUS.refunded,
];

/*
 * Rejected requests have their own short
 * timeline.
 */
const REJECTED_TIMELINE: TimelineStep[] = [
  REQUEST_STATUS.submitted,

  REQUEST_STATUS.rejected,
];

const timelineLabels: Record<
  TimelineStep,
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

  [REQUEST_STATUS.refund_offered]:
    "Refund Offered",

  [REQUEST_STATUS.refund_requested]:
    "Refund Requested",

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

  [REQUEST_STATUS.rejected]:
    "Request Rejected",
};

export default function RequestTimeline({
  status,
  history,
  orderChange,
  refundRequest,
  partialRefunds,
}: Props) {

  /*
   * ========================================
   * SPECIAL STATES
   * ========================================
   */

  const isRejected =
    status === REQUEST_STATUS.rejected;

  /*
   * IMPORTANT:
   *
   * refund_requested is now a REAL request
   * status.
   *
   * The refundRequest object is still used
   * for refund-specific information such as
   * preference and timestamps.
   */

  const refundRequested =
    status ===
    REQUEST_STATUS.refund_requested ||
    refundRequest?.status ===
      "requested";

  const refundProcessing =
    refundRequest?.status ===
    "processing";

  const refundCompleted =
    status ===
      REQUEST_STATUS.refunded ||
    refundRequest?.status ===
      "completed";

  /*
   * ========================================
   * BUILD TIMELINE
   * ========================================
   */

  let timeline: TimelineStep[];

  if (isRejected) {

    timeline =
      REJECTED_TIMELINE;

  } else if (refundCompleted) {

    timeline =
      REFUNDED_TIMELINE;

  } else if (
    refundRequested ||
    refundProcessing
  ) {

    timeline =
      REFUND_TIMELINE;

  } else {

    timeline =
      TIMELINE;
  }

  /*
   * ========================================
   * CURRENT TIMELINE STEP
   * ========================================
   */

  let currentTimelineStep: TimelineStep =
    status;

  if (
    refundRequested ||
    refundProcessing
  ) {
    currentTimelineStep =
      "refund_requested";
  }

  if (refundCompleted) {
    currentTimelineStep =
      REQUEST_STATUS.refunded;
  }

  const currentIndex =
    timeline.indexOf(
      currentTimelineStep
    );

  /*
   * ========================================
   * ADDITIONAL ITEM HOLD
   * ========================================
   */

  const waitingForAdditionalItems =
    orderChange?.active === true;

  /*
   * ========================================
   * TIMESTAMP HELPER
   * ========================================
   */

  function formatTimestamp(
    timestamp: any
  ) {
    if (!timestamp) {
      return null;
    }

    try {
      if (
        typeof timestamp.toDate ===
        "function"
      ) {
        return timestamp
          .toDate()
          .toLocaleString();
      }

      return new Date(
        timestamp
      ).toLocaleString();

    } catch {
      return null;
    }
  }

  /*
   * ========================================
   * RENDER
   * ========================================
   */

  return (
    <div
      className="
        rounded-2xl
        border
        border-slate-200
        bg-white
        p-6
        shadow-sm
        dark:border-slate-800
        dark:bg-slate-900
        dark:shadow-none
      "
    >

      {/* HEADER */}

      <div
        className="
          flex
          flex-col
          gap-4
          sm:flex-row
          sm:items-start
          sm:justify-between
        "
      >

        <div>

          <h2
            className="
              text-2xl
              font-semibold
              text-slate-950
              dark:text-white
            "
          >
            Shipment Progress
          </h2>

          <p
            className="
              mt-1
              text-sm
              text-slate-500
              dark:text-slate-400
            "
          >
            Track the progress of your complete
            ShipIN order.
          </p>

        </div>

        {/* REJECTED BADGE */}

        {isRejected && (
          <div
            className="
              shrink-0
              rounded-full
              border
              border-red-500/30
              bg-red-500/10
              px-4
              py-2
            "
          >
            <span
              className="
                text-sm
                font-semibold
                text-red-400
              "
            >
              Request Rejected
            </span>
          </div>
        )}

        {/* REFUND REQUESTED BADGE */}

        {!isRejected &&
          !refundCompleted &&
          refundRequested && (

          <div
            className="
              shrink-0
              rounded-full
              border
              border-red-500/30
              bg-red-500/10
              px-4
              py-2
            "
          >
            <span
              className="
                text-sm
                font-semibold
                text-red-400
              "
            >
              Refund Requested
            </span>
          </div>
        )}

        {/* REFUNDED BADGE */}

        {!isRejected &&
          refundCompleted && (

          <div
            className="
              shrink-0
              rounded-full
              border
              border-green-500/30
              bg-green-500/10
              px-4
              py-2
            "
          >
            <span
              className="
                text-sm
                font-semibold
                text-green-400
              "
            >
              Refunded
            </span>
          </div>
        )}

        {/* ADDITIONAL ITEM HOLD */}

        {!isRejected &&
          !refundRequested &&
          !refundProcessing &&
          !refundCompleted &&
          waitingForAdditionalItems && (

          <div
            className="
              shrink-0
              rounded-full
              border
              border-amber-500/30
              bg-amber-500/10
              px-4
              py-2
            "
          >
            <span
              className="
                text-sm
                font-semibold
                text-amber-300
              "
            >
              Waiting for Additional Items
            </span>
          </div>
        )}

      </div>

      {/* REJECTION MESSAGE */}

      {isRejected && (

        <div
          className="
            mt-6
            rounded-xl
            border
            border-red-500/20
            bg-red-500/5
            p-5
          "
        >

          <div className="flex gap-3">

            <div
              className="
                flex
                h-9
                w-9
                shrink-0
                items-center
                justify-center
                rounded-full
                border
                border-red-500/30
                bg-red-500/10
                font-bold
                text-red-400
              "
            >
              !
            </div>

            <div>

              <h3
                className="
                  font-semibold
                  text-red-400
                "
              >
                This request was rejected
              </h3>

              <p
                className="
                  mt-1
                  text-sm
                  leading-6
                  text-slate-400
                "
              >
                Your purchase request could
                not be processed. Please
                review the rejection reason
                above.
              </p>

            </div>

          </div>

        </div>
      )}

      {/* REFUND MESSAGE */}

      {!isRejected &&
        refundRequested && (

        <div
          className="
            mt-6
            rounded-xl
            border
            border-red-500/20
            bg-red-500/5
            p-5
          "
        >

          <div className="flex gap-3">

            <div
              className="
                flex
                h-9
                w-9
                shrink-0
                items-center
                justify-center
                rounded-full
                border
                border-red-500/30
                bg-red-500/10
                font-bold
                text-red-400
              "
            >
              !
            </div>

            <div>

              <h3
                className="
                  font-semibold
                  text-red-400
                "
              >
                Refund request received
              </h3>

              <p
                className="
                  mt-1
                  text-sm
                  leading-6
                  text-slate-400
                "
              >
                Your refund request has been
                submitted and is awaiting
                processing by our team.
              </p>

              {refundRequest?.preference && (

                <p
                  className="
                    mt-2
                    text-xs
                    font-medium
                    text-red-400/80
                  "
                >
                  Preference:{" "}

                  {refundRequest.preference ===
                  "wallet"
                    ? "ShipIN Wallet"
                    : refundRequest.preference ===
                      "original_payment"
                    ? "Original payment method"
                    : "Original payment sources"}
                </p>

              )}

            </div>

          </div>

        </div>
      )}

      {/* ADDITIONAL ITEM HOLD MESSAGE */}

      {!isRejected &&
        !refundRequested &&
        !refundProcessing &&
        !refundCompleted &&
        waitingForAdditionalItems && (

        <div
          className="
            mt-6
            rounded-xl
            border
            border-amber-500/20
            bg-amber-500/5
            p-5
          "
        >

          <div className="flex gap-3">

            <div
              className="
                flex
                h-9
                w-9
                shrink-0
                items-center
                justify-center
                rounded-full
                bg-amber-500/10
                font-bold
                text-amber-300
              "
            >
              !
            </div>

            <div>

              <h3
                className="
                  font-semibold
                  text-amber-300
                "
              >
                Shipment temporarily paused
              </h3>

              <p
                className="
                  mt-1
                  text-sm
                  leading-6
                  text-slate-400
                "
              >
                Your shipment is waiting
                for one or more additional
                requested items. The shipment
                will continue once the
                additional items are received
                and packed.
              </p>

              {orderChange?.requiresRepacking && (

                <p
                  className="
                    mt-2
                    text-sm
                    text-slate-500
                  "
                >
                  Your original parcel was
                  already packed, so it will
                  be repacked together with the
                  additional item.
                </p>

              )}

            </div>

          </div>

        </div>
      )}

      {/* MAIN TIMELINE */}

      <div className="mt-7 space-y-5">

        {timeline.map(
          (step, index) => {

            const completed =
              index < currentIndex ||
              (
                isRejected &&
                index === 0
              );

            const active =
              index === currentIndex;

            const rejectedStep =
              isRejected &&
              step ===
                REQUEST_STATUS.rejected;

            const refundStep =
              step ===
              "refund_requested";

            const refundedStep =
              step ===
              REQUEST_STATUS.refunded;

            const stepTimestamp =
              refundStep
                ? refundRequest?.requestedAt
                : refundedStep
                ? refundRequest?.processedAt
                : history?.[
                    step as RequestStatus
                  ];

            const formattedTimestamp =
              formatTimestamp(
                stepTimestamp
              );

            return (
              <div
                key={step}
                className="
                  flex
                  items-center
                  gap-4
                "
              >

                {/* INDICATOR */}

                <div
                  className={`
                    flex
                    h-9
                    w-9
                    shrink-0
                    items-center
                    justify-center
                    rounded-full
                    text-sm
                    font-bold

                    ${
                      rejectedStep ||
                      refundStep
                        ? `
                          border
                          border-red-500/40
                          bg-red-500/10
                          text-red-400
                        `
                        : refundedStep
                        ? `
                          bg-green-500
                          text-white
                        `
                        : completed
                        ? `
                          bg-green-500
                          text-white
                        `
                        : active
                        ? `
                          border-2
                          border-green-500
                          bg-green-500/10
                          text-green-500
                        `
                        : `
                          bg-slate-100
                          text-slate-400
                          dark:bg-slate-800
                          dark:text-slate-500
                        `
                    }
                  `}
                >

                  {rejectedStep ||
                  refundStep
                    ? "!"
                    : completed ||
                      refundedStep
                    ? "✓"
                    : index + 1}

                </div>

                {/* STEP INFORMATION */}

                <div>

                  <div
                    className={`
                      font-medium

                      ${
                        rejectedStep ||
                        refundStep
                          ? "text-red-600 dark:text-red-400"
                          : refundedStep
                          ? "text-green-600 dark:text-green-400"
                          : active
                          ? "text-green-600 dark:text-green-400"
                          : completed
                          ? "text-slate-950 dark:text-white"
                          : "text-slate-400 dark:text-slate-500"
                      }
                    `}
                  >
                    {timelineLabels[step]}
                  </div>

                  {/* TIMESTAMP */}

                  {formattedTimestamp && (
                    <p
                      className="
                        mt-1
                        text-xs
                        text-slate-500
                        dark:text-slate-400
                      "
                    >
                      {formattedTimestamp}
                    </p>
                  )}

                  {/* REFUND DESCRIPTION */}

                  {refundStep && (
                    <p
                      className="
                        mt-1
                        text-xs
                        font-medium
                        text-red-400/80
                      "
                    >
                      Refund request awaiting
                      processing
                    </p>
                  )}

                  {/* ADDITIONAL ITEM HOLD */}

                  {active &&
                    !isRejected &&
                    !refundStep &&
                    waitingForAdditionalItems && (

                    <p
                      className="
                        mt-1
                        text-xs
                        font-medium
                        text-amber-400
                      "
                    >
                      Paused while waiting
                      for additional items
                    </p>
                  )}

                  {/* REJECTION DESCRIPTION */}

                  {rejectedStep && (
                    <p
                      className="
                        mt-1
                        text-xs
                        font-medium
                        text-red-400/80
                      "
                    >
                      Request stopped at this
                      stage
                    </p>
                  )}

                </div>

              </div>
            );
          }
        )}

      </div>

      {/* PARTIAL REFUND EVENTS */}

      {partialRefunds &&
        partialRefunds.length > 0 && (
          <div className="mt-8 border-t border-slate-200 pt-7 dark:border-slate-800">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Refund History
            </h3>

            <div className="mt-5 space-y-4">
              {partialRefunds.map(
                (refund) => {
                  const refundTimestamp =
                    formatTimestamp(
                      refund.createdAt
                    );

                  return (
                    <div
                      key={refund.id}
                      className="
                        flex
                        items-start
                        gap-4
                      "
                    >
                      {/* INDICATOR */}

                      <div
                        className="
                          flex
                          h-9
                          w-9
                          shrink-0
                          items-center
                          justify-center
                          rounded-full
                          bg-amber-500
                          text-sm
                          font-bold
                          text-white
                        "
                      >
                        $
                      </div>

                      {/* INFORMATION */}

                      <div className="min-w-0">
                        <div className="font-medium text-amber-600 dark:text-amber-400">
                          Partial Refund
                        </div>

                        <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">
                          $
                          {Number(
                            refund.amount
                          ).toFixed(2)}
                        </p>

                        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                          {refund.reason}
                        </p>

                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                          Refund method:{" "}
                          {refund.method ===
                          "wallet"
                            ? "ShipIN Wallet"
                            : "Original Payment Method"}
                        </p>

                        {refund.paypalRefundTransactionId && (
                          <p className="mt-1 break-all font-mono text-xs text-slate-500 dark:text-slate-400">
                            PayPal Transaction ID:{" "}
                            <span className="font-semibold text-slate-700 dark:text-slate-300">
                              {
                                refund.paypalRefundTransactionId
                              }
                            </span>
                          </p>
                        )}

                        {refundTimestamp && (
                          <p className="mt-1 text-xs text-slate-500 dark:text-slate-500">
                            {refundTimestamp}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                }
              )}
            </div>
          </div>
        )}

    </div>
  );
}