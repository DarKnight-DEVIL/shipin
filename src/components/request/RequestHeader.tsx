"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import StatusBadge from "@/components/ui/StatusBadge";
import type { Request } from "@/types/request";

interface Props {
  request: Request;
}

export default function RequestHeader({ request }: Props) {
  const submitted =
    request.createdAt?.toDate?.()?.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    }) ?? null;

  return (
    <header className="space-y-4">
      <Link
        href="/requests"
        className="inline-flex items-center gap-1.5 text-sm text-slate-500 transition hover:text-slate-900 dark:hover:text-white"
      >
        <ArrowLeft size={14} strokeWidth={2} />
        My Requests
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="shipin-section-label">Purchase request</p>
          <h1 className="mt-1 font-mono text-3xl font-semibold tracking-tight text-slate-950 dark:text-white sm:text-4xl">
            #{request.id.slice(0, 6).toUpperCase()}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-500">
            {request.email && <span className="truncate">{request.email}</span>}
            {request.email && submitted && (
              <span className="hidden h-1 w-1 rounded-full bg-slate-600 sm:inline" />
            )}
            {submitted && <span>Submitted {submitted}</span>}
          </div>
        </div>

        <StatusBadge status={request.status} />
      </div>
    </header>
  );
}