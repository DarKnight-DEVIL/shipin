"use client";

import { Check } from "lucide-react";

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

export default function Stepper({ currentStatus }: Props) {
  const currentIndex = REQUEST_WORKFLOW.indexOf(currentStatus);

  return (
    <ol className="space-y-0">
      {REQUEST_WORKFLOW.map((status, index) => {
        const completed = index < currentIndex;
        const current = index === currentIndex;
        const last = index === REQUEST_WORKFLOW.length - 1;

        return (
          <li key={status} className="flex gap-3">
            <div className="flex flex-col items-center">
              <span
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] ${
                  completed
                    ? "border-transparent bg-[var(--accent-solid)] text-white"
                    : current
                      ? "border-[var(--accent-solid)] bg-[var(--card)]"
                      : "border-[var(--border-strong)] bg-[var(--card)]"
                }`}
              >
                {completed ? (
                  <Check size={11} strokeWidth={3} />
                ) : current ? (
                  <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent-solid)]" />
                ) : null}
              </span>

              {!last && (
                <span
                  className={`my-1 w-px flex-1 ${
                    completed
                      ? "bg-[var(--accent-solid)]/40"
                      : "bg-[var(--border)]"
                  }`}
                />
              )}
            </div>

            <span
              className={`pb-4 text-[13px] leading-5 ${
                current
                  ? "font-medium text-[var(--foreground)]"
                  : "text-[var(--muted)]"
              }`}
            >
              {statusLabels[status]}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
