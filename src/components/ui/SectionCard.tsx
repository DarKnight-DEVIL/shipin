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
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-white">
          {title}
        </h2>

        {subtitle && (
          <p className="text-slate-400 mt-2">
            {subtitle}
          </p>
        )}
      </div>

      {children}
    </div>
  );
}