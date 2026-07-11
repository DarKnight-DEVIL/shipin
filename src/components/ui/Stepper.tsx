"use client";

import { statusLabels } from "@/lib/statusLabels";
import type { RequestStatus } from "@/lib/requestStatus";
import { REQUEST_STATUS } from "@/lib/requestStatus";

const REQUEST_WORKFLOW: RequestStatus[] = [
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

interface Props {
  currentStatus: RequestStatus;
}

export default function Stepper({
  currentStatus,
}: Props) {
  const currentIndex = REQUEST_WORKFLOW.indexOf(
    currentStatus
  );

  return (
    <div className="space-y-3">

      {REQUEST_WORKFLOW.map(
        (status, index) => {

          const completed =
            index < currentIndex;

          const current =
            index === currentIndex;

          return (

            <div
              key={status}
              className="flex items-center gap-4"
            >

              <div
                className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                  completed
                    ? "bg-green-500 text-white"

                    : current
                    ? "bg-purple-600 text-white"

                    : "bg-slate-700 text-slate-400"
                }`}
              >

                {completed ? "✓" : ""}

              </div>

              <span
                className={
                  current
                    ? "text-white font-semibold"

                    : "text-slate-400"
                }
              >

                {
                  statusLabels[
                    status
                  ]
                }

              </span>

            </div>

          );

        }
      )}

    </div>
  );
}