import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import type { Request } from "@/types/request";
import { SHIPMENT_PHASES } from "./helpers";

interface ShipmentCardProps {
  request: Request;
}

export default function ShipmentCard({ request }: ShipmentCardProps) {
  const phaseIndex = SHIPMENT_PHASES.findIndex((p) =>
    p.statuses.includes(request.status)
  );

  const delivered = request.status === "delivered";
  const carrier = request.tracking?.carrier;
  const eta = request.tracking?.estimatedDelivery;

  const dotColor = delivered ? "bg-emerald-500" : "bg-[var(--accent-solid)]";
  const ringColor = delivered
    ? "ring-4 ring-emerald-500/20"
    : "ring-4 ring-[color-mix(in_srgb,var(--accent-solid)_25%,transparent)]";

  const pct =
    phaseIndex < 0
      ? 0
      : Math.round(((phaseIndex + 1) / SHIPMENT_PHASES.length) * 100);

  return (
    <div className="dash-card p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="app-kicker text-[var(--muted)]">
            ShipIN tracking
          </p>
          <p className="mt-1 truncate font-mono text-[13px] font-medium tracking-tight text-[var(--foreground)]">
            {request.tracking?.internalTrackingId}
          </p>
        </div>
        <Link
          href={`/requests/${request.id}`}
          aria-label="View shipment details"
          className="app-iconbtn -mr-1 -mt-1 h-9 w-9 text-[var(--muted)] hover:text-[var(--foreground)]"
        >
          <ArrowUpRight size={15} />
        </Link>
      </div>

      {/* Progress bar */}
      <div className="mt-4 h-[3px] w-full overflow-hidden rounded-full bg-[var(--surface-3)]">
        <div
          className="h-full rounded-full bg-[var(--accent-solid)] dash-progress-fill"
          style={{ width: `${pct}%` }}
        />
      </div>

      <ol className="mt-4">
        {SHIPMENT_PHASES.map((phase, i) => {
          const reached = phaseIndex >= 0 && i <= phaseIndex;
          const current = i === phaseIndex;
          return (
            <li key={phase.label} className="relative flex items-center gap-3 pb-3 last:pb-0">
              {i < SHIPMENT_PHASES.length - 1 && (
                <span
                  className={`absolute left-[5px] top-[15px] h-[18px] w-px ${
                    i < phaseIndex ? dotColor : "bg-[var(--border)]"
                  }`}
                />
              )}
              <span
                className={`relative z-[1] h-[11px] w-[11px] shrink-0 rounded-full ${
                  reached ? dotColor : "bg-[var(--border-strong)]"
                } ${current ? ringColor : ""}`}
              />
              <span
                className={`text-[12px] ${
                  current
                    ? "font-semibold text-[var(--foreground)]"
                    : reached
                    ? "text-[var(--foreground)] opacity-85"
                    : "text-[var(--muted)]"
                }`}
              >
                {phase.label}
              </span>
              {current && (
                <span className="ml-auto text-[10px] font-medium text-[var(--accent)]">Now</span>
              )}
            </li>
          );
        })}
      </ol>

      {(carrier || eta) && (
        <dl className="mt-4 space-y-1.5 border-t border-[var(--border)] pt-4 text-[11px]">
          {carrier && (
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-[var(--muted)]">Carrier</dt>
              <dd className="truncate font-medium text-[var(--foreground)]">{String(carrier)}</dd>
            </div>
          )}
          {eta && (
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-[var(--muted)]">Estimated delivery</dt>
              <dd className="font-medium text-[var(--foreground)]">{String(eta)}</dd>
            </div>
          )}
        </dl>
      )}

      <Link
        href={`/requests/${request.id}`}
        className="app-btn app-btn-secondary mt-4 w-full justify-center"
      >
        View shipment
        <ArrowRight size={12} className="dash-arrow" />
      </Link>
    </div>
  );
}
