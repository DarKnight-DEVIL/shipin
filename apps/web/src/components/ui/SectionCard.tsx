"use client";

import React from "react";

interface Props {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  /** Set to false when the children manage their own padding (tables, lists). */
  padded?: boolean;
  className?: string;
}

/**
 * Panel with a header strip. Static by design: no shadow, no hover lift.
 */
export default function SectionCard({
  title,
  subtitle,
  actions,
  children,
  padded = true,
  className = "",
}: Props) {
  return (
    <section className={`app-panel app-panel-flush ${className}`}>
      <div className="flex items-start justify-between gap-4 border-b border-[var(--border)] px-5 py-3.5">
        <div className="min-w-0">
          <h2 className="app-section-title">{title}</h2>

          {subtitle && (
            <p className="mt-0.5 text-[12px] leading-5 text-[var(--muted)]">
              {subtitle}
            </p>
          )}
        </div>

        {actions && <div className="shrink-0">{actions}</div>}
      </div>

      <div className={padded ? "p-5" : ""}>{children}</div>
    </section>
  );
}
