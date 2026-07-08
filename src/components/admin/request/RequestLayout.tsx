"use client";

import { ReactNode } from "react";

interface Props {
  title: string;
  subtitle?: string;
  sidebar: ReactNode;
  children: ReactNode;
}

export default function RequestLayout({
  title,
  subtitle,
  sidebar,
  children,
}: Props) {
  return (
    <div className="min-h-screen bg-slate-950">

      <div className="max-w-7xl mx-auto p-8">

        {/* Header */}

        <div className="mb-8">

          <h1 className="text-4xl font-bold text-white">
            {title}
          </h1>

          {subtitle && (
            <p className="text-slate-400 mt-2">
              {subtitle}
            </p>
          )}

        </div>

        {/* Layout */}

        <div className="grid grid-cols-12 gap-8">

          {/* Sidebar */}

          <div className="col-span-3">

            {sidebar}

          </div>

          {/* Content */}

          <div className="col-span-9">

            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8">

              {children}

            </div>

          </div>

        </div>

      </div>

    </div>
  );
}