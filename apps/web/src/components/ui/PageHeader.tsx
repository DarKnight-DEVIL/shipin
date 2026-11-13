import Link from "next/link";
import { ChevronLeft } from "lucide-react";

interface Props {
  title: string;
  subtitle?: string;
  eyebrow?: string;
  actions?: React.ReactNode;
  backHref?: string;
  backLabel?: string;
}

/**
 * Canonical page header for every signed-in page.
 * Keeping one header means titles, spacing and actions never drift.
 */
export default function PageHeader({
  title,
  subtitle,
  eyebrow,
  actions,
  backHref,
  backLabel = "Back",
}: Props) {
  return (
    <header className="mb-6 sm:mb-7">
      {backHref && (
        <Link
          href={backHref}
          className="mb-3 inline-flex items-center gap-1 text-[12px] font-medium text-[var(--muted)] transition-colors hover:text-[var(--foreground)]"
        >
          <ChevronLeft size={14} />
          {backLabel}
        </Link>
      )}

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          {eyebrow && <p className="app-kicker mb-1.5">{eyebrow}</p>}

          <h1 className="app-h1">{title}</h1>

          {subtitle && <p className="app-lead">{subtitle}</p>}
        </div>

        {actions && (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {actions}
          </div>
        )}
      </div>
    </header>
  );
}
