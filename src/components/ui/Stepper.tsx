"use client";

import {
  REQUEST_WORKFLOW,
  REQUEST_STATUS_LABELS,
} from "@/constants/requestWorkflow";

interface Props {
  currentStatus: string;
}

export default function Stepper({
  currentStatus,
}: Props) {
  const currentIndex =
    REQUEST_WORKFLOW.indexOf(
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
                  REQUEST_STATUS_LABELS[
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