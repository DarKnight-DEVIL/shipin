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
      className={`relative w-full rounded-[10px] border p-4 text-left transition-colors ${
        selected
          ? "border-[var(--accent-solid)] bg-[var(--accent-soft)]"
          : "border-[var(--border)] bg-[var(--card)] hover:border-[var(--border-strong)] hover:bg-[var(--surface-2)]"
      } ${disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}
    >
      {selected && (
        <span className="absolute right-3.5 top-3.5 flex h-4.5 w-4.5 items-center justify-center rounded-full bg-[var(--accent-solid)] text-white">
          <Check size={11} strokeWidth={3} />
        </span>
      )}

      <div className={`flex items-start gap-3 ${selected ? "pr-7" : ""}`}>
        {icon && (
          <span className="mt-0.5 shrink-0 text-[var(--muted)]">{icon}</span>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="text-[13px] font-semibold leading-snug text-[var(--foreground)]">
              {title}
            </h3>

            <span
              className={`shrink-0 text-[12px] font-semibold tabular-nums ${
                price === 0
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-[var(--foreground)]"
              }`}
            >
              {price === 0 ? "Free" : `+$${price}`}
            </span>
          </div>

          <p className="mt-1 text-[12px] leading-5 text-[var(--muted)]">
            {description}
          </p>

          {disabled && (
            <p className="mt-2 text-[11px] font-medium text-rose-600 dark:text-rose-400">
              Not available with the selected option.
            </p>
          )}
        </div>
      </div>
    </button>
  );
}
