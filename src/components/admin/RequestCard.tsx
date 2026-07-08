"use client";

import Link from "next/link";
import StatusBadge from "./StatusBadge";

interface Props {
  request: any;
}

export default function RequestCard({
  request,
}: Props) {
  return (
    <Link
      href={`/admin/requests/${request.id}`}
      className="block"
    >
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 hover:border-purple-500 transition-all hover:scale-[1.02]">

        <div className="flex justify-between items-start">

          <div>

            <h2 className="text-lg font-bold text-white">
              #{request.id.slice(0,6)}
            </h2>

            <p className="text-slate-400 text-sm mt-1">
              {request.email}
            </p>

          </div>

          <StatusBadge
            status={request.status}
          />

        </div>

        <div className="mt-6 space-y-2 text-sm">

          <div className="flex justify-between">

            <span className="text-slate-500">
              Items
            </span>

            <span className="text-white">
              {request.items?.length || 0}
            </span>

          </div>

          <div className="flex justify-between">

            <span className="text-slate-500">
              Total
            </span>

            <span className="text-green-400">

              {request.quote
                ? `$${request.quote.grandTotal.toFixed(2)}`
                : "Pending"}

            </span>

          </div>

        </div>

        <div className="mt-6 flex justify-between items-center">

          <span className="text-xs text-slate-500">

            {request.createdAt?.toDate
              ? request.createdAt
                  .toDate()
                  .toLocaleDateString()
              : "Recently"}

          </span>

          <span className="text-purple-400 font-semibold">

            View →

          </span>

        </div>

      </div>
    </Link>
  );
}