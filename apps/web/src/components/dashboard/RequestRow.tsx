import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { Request } from "@/types/request";
import StatusBadge from "@/components/ui/StatusBadge";

interface RequestRowProps {
  request: Request;
}

export default function RequestRow({ request }: RequestRowProps) {
  const preview = request.items
    .slice(0, 2)
    .map((item) => item.name)
    .join(", ");
  const extra = request.items.length > 2 ? ` +${request.items.length - 2}` : "";
  const initial = (preview.trim().charAt(0) || "#").toUpperCase();

  return (
    <Link
      href={`/requests/${request.id}`}
      className="group flex items-center gap-3.5 border-t border-[var(--border)] px-4 py-3.5 transition-colors first:border-t-0 hover:bg-[var(--surface-2)] sm:px-5"
    >
      <span className="dash-tile">{initial}</span>

      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium text-[var(--foreground)]">
          {preview || "No items listed"}
          {extra}
        </p>
        <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-[var(--muted)]">
          <span className="font-mono tracking-tight">
            #{request.id.slice(0, 6).toUpperCase()}
          </span>
          <span className="text-[var(--border-strong)]">/</span>
          <span>
            {request.items.length}{" "}
            {request.items.length === 1 ? "item" : "items"}
          </span>
          {request.tracking?.internalTrackingId && (
            <>
              <span className="text-[var(--border-strong)]">/</span>
              <span className="truncate font-mono">
                {request.tracking.internalTrackingId}
              </span>
            </>
          )}
        </p>
      </div>

      {request.createdAt && (
        <span className="hidden w-16 shrink-0 text-right text-[11px] tabular-nums text-[var(--muted)] sm:block">
          {request.createdAt.toDate().toLocaleDateString(undefined, {
            day: "numeric",
            month: "short",
          })}
        </span>
      )}

      <span className="flex shrink-0 items-center justify-end sm:w-[124px]">
        <StatusBadge status={request.status} />
      </span>

      <ChevronRight
        size={14}
        className="dash-arrow hidden shrink-0 text-[var(--muted-soft)] sm:block"
      />
    </Link>
  );
}
