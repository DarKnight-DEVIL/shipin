"use client";

import React from "react";
import { Check } from "lucide-react";

interface Props {
  title: string;
  description: string;
  price: number;
  selected?: boolean;
  disabled?: boolean;
  icon?: React.ReactNode;
  onClick?: () => void;
}

export default function SelectionCard({
  title,
  description,
  price,
  selected = false,
  disabled = false,
  icon,
  onClick,
}: Props) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`
        relative w-full rounded-2xl border p-5 text-left
        transition-all duration-200
        ${
          selected
            ? "border-purple-500 bg-purple-50 ring-1 ring-purple-500/20 dark:bg-purple-500/10"
            : "border-slate-200 bg-white hover:border-slate-400 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-slate-500 dark:hover:bg-slate-800/50"
        }
        ${disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"}
      `}
    >
      {selected && (
        <div className="absolute right-4 top-4 flex h-6 w-6 items-center justify-center rounded-full bg-purple-600 text-white">
          <Check size={14} strokeWidth={3} />
        </div>
      )}

      <div className={`flex items-start gap-3 ${selected ? "pr-8" : ""}`}>
        {icon && <div className="mt-0.5 shrink-0 text-xl">{icon}</div>}

        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold leading-snug text-slate-950 dark:text-white">
            {title}
          </h3>

          <p
            className={`mt-1 text-sm font-semibold ${
              price === 0
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-purple-600 dark:text-purple-400"
            }`}
          >
            {price === 0 ? "Free" : `+$${price}`}
          </p>

          <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-400">
            {description}
          </p>

          {disabled && (
            <p className="mt-3 text-xs font-medium text-red-600 dark:text-red-400">
              Not available with the selected option.
            </p>
          )}
        </div>
      </div>
    </button>
  );
}