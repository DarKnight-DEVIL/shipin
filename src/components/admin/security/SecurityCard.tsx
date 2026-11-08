import type { ReactNode } from "react";

interface SecurityCardProps {
  title: string;
  description: string;
  /** Rendered on the right of the header, e.g. an "Enabled" pill. */
  badge?: ReactNode;
  children: ReactNode;
}

/**
 * Shared frame for one second factor on the admin security screen.
 * Purely presentational.
 */
export default function SecurityCard({
  title,
  description,
  badge,
  children,
}: SecurityCardProps) {
  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-white">{title}</h2>
          <p className="mt-1 max-w-xl text-sm text-slate-400">{description}</p>
        </div>

        {badge}
      </div>

      <div className="mt-5">{children}</div>
    </section>
  );
}

/** Small status pill used in the card header. */
export function StatusPill({
  enabled,
  label,
}: {
  enabled: boolean;
  label?: string;
}) {
  return (
    <span
      className={`rounded-full px-3 py-1 text-xs font-semibold ${
        enabled
          ? "bg-emerald-500/15 text-emerald-300"
          : "bg-slate-700/60 text-slate-300"
      }`}
    >
      {label ?? (enabled ? "Enabled" : "Not enabled")}
    </span>
  );
}
