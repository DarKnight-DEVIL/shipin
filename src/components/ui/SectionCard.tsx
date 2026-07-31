"use client";

import React from "react";

interface Props {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}

export default function SectionCard({
  title,
  subtitle,
  children,
}: Props) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:shadow-none">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-slate-950 dark:text-white">
          {title}
        </h2>

        {subtitle && (
          <p className="mt-2 text-slate-600 dark:text-slate-400">
            {subtitle}
          </p>
        )}
      </div>

      {children}
    </div>
  );
}