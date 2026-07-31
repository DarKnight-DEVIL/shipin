"use client";

import StatusBadge from "@/components/ui/StatusBadge";
import type { Request } from "@/types/request";

interface Props {
  request: Request;
}

export default function RequestHeader({
  request,
}: Props) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:shadow-none">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
            Purchase Request
          </p>

          <h1 className="text-4xl font-bold text-slate-950 dark:text-white">
            Request #
            {request.id
              .slice(0, 6)
              .toUpperCase()}
          </h1>

          <p className="mt-2 text-slate-600 dark:text-slate-400">
            {request.email}
          </p>

          <p className="mt-1 text-sm text-slate-500">
            Submitted on{" "}
            {request.createdAt
              ?.toDate?.()
              .toLocaleDateString()}
          </p>
        </div>

        <StatusBadge
          status={request.status}
        />
      </div>
    </div>
  );
}