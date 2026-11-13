"use client";

import Link from "next/link";
import { ChevronLeft } from "lucide-react";
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

  const itemCount = request.items?.length ?? 0;

  return (
    <header className="mb-6">
      <Link
        href="/requests"
        className="mb-3 inline-flex items-center gap-1 text-[12px] font-medium text-[var(--muted)] transition-colors hover:text-[var(--foreground)]"
      >
        <ChevronLeft size={14} />
        Requests
      </Link>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="app-kicker">Purchase request</p>

          <h1 className="mt-1.5 font-mono text-[24px] font-semibold tracking-[-0.01em] text-[var(--foreground)] sm:text-[26px]">
            #{request.id.slice(0, 6).toUpperCase()}
          </h1>

          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-[var(--muted)]">
            {request.email && (
              <span className="max-w-[240px] truncate">{request.email}</span>
            )}

            {request.email && (submitted || itemCount > 0) && (
              <span className="h-1 w-1 rounded-full bg-[var(--border-strong)]" />
            )}

            {itemCount > 0 && (
              <span>
                {itemCount} {itemCount === 1 ? "item" : "items"}
              </span>
            )}

            {submitted && (
              <>
                {itemCount > 0 && (
                  <span className="h-1 w-1 rounded-full bg-[var(--border-strong)]" />
                )}
                <span>Submitted {submitted}</span>
              </>
            )}
          </div>
        </div>

        <div className="pt-1">
          <StatusBadge status={request.status} />
        </div>
      </div>
    </header>
  );
}
