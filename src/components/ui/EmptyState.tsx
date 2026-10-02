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
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center dark:border-slate-700 dark:bg-slate-900">
      
      {icon && (
        <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
          {icon}
        </div>
      )}

      <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
        {title}
      </h3>

      {description && (
        <p className="mt-2 max-w-md text-sm leading-6 text-slate-500 dark:text-slate-400">
          {description}
        </p>
      )}

      {action && (
        <div className="mt-6">
          {action}
        </div>
      )}
    </div>
  );
}