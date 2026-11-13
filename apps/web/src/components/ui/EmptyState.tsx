"use client";

import { ReactNode } from "react";

interface Props {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}

export default function EmptyState({
  icon,
  title,
  description,
  action,
}: Props) {
  return (
    <div className="app-panel border-dashed px-6 py-14 text-center">
      {icon && (
        <div className="mx-auto mb-4 flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--surface-2)] text-[var(--muted)]">
          {icon}
        </div>
      )}

      <h3 className="text-[15px] font-semibold text-[var(--foreground)]">
        {title}
      </h3>

      {description && (
        <p className="mx-auto mt-1.5 max-w-sm text-[13px] leading-6 text-[var(--muted)]">
          {description}
        </p>
      )}

      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
