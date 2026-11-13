import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import type { DashboardMetricId } from "@/features/users/services/dashboardMetrics";
import useCountUp from "./useCountUp";
import { getMetricHref, METRIC_ICONS } from "./helpers";
import { Activity } from "lucide-react";

interface MetricCardProps {
  id: DashboardMetricId;
  label: string;
  description: string;
  value: number;
  highlight?: boolean;
  index: number;
}

export default function MetricCard({
  id,
  label,
  description,
  value,
  highlight = false,
  index,
}: MetricCardProps) {
  const Icon = METRIC_ICONS[id] ?? Activity;
  const animated = useCountUp(value, 700);

  return (
    <Link
      href={getMetricHref(id)}
      aria-label={`${value} ${label}`}
      className={`dash-card dash-in group block p-4 sm:p-5 ${
        highlight ? "dash-stat--hot" : ""
      }`}
      style={{ "--i": index } as React.CSSProperties}
    >
      <div className="flex items-center justify-between">
        <span className="dash-chip">
          <Icon size={16} />
        </span>
        <ArrowUpRight
          size={14}
          aria-hidden="true"
          className="text-[var(--muted-soft)] opacity-0 transition-opacity group-hover:opacity-100"
        />
      </div>

      <p
        className={`dash-num mt-4 ${
          highlight ? "text-[var(--accent)]" : "text-[var(--foreground)]"
        }`}
      >
        {animated}
      </p>
      <p className="mt-1.5 text-[12.5px] font-medium text-[var(--foreground)]">
        {label}
      </p>
      <p className="mt-0.5 line-clamp-1 text-[11px] text-[var(--muted)]">
        {description}
      </p>
    </Link>
  );
}

