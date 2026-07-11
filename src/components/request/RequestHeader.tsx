"use client";

import StatusBadge from "@/components/ui/StatusBadge";
import type { Request } from "@/types/request";

interface Props {
  request: Request;
}

export default function RequestHeader({ request }: Props) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-4xl font-bold text-white">
            Request #{request.id.slice(0, 6)}
          </h1>

          <p className="text-slate-400 mt-2">
            {request.email}
          </p>

          <p className="text-slate-500 text-sm mt-1">
            Submitted on{" "}
            {request.createdAt?.toDate?.().toLocaleDateString() || "N/A"}
          </p>
        </div>

        {/* Explicitly fallback or typecast if StatusBadge variant doesn't strictly match the union */}
        <StatusBadge status={request.status as any} />
      </div>
    </div>
  );
}