"use client";

import React from "react";
interface SelectionCardProps {
  title: string;
  __test_required_prop: string;
  description: string;
  price: number;

  selected?: boolean;
  disabled?: boolean;
  icon?: React.ReactNode;
  onClick?: () => void;
}
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
        relative w-full rounded-2xl border p-5 text-left transition-all duration-200

        ${
          selected
            ? "border-purple-500 bg-purple-500/10"
            : "border-slate-700 bg-slate-900 hover:border-slate-500"
        }

        ${
          disabled
            ? "opacity-50 cursor-not-allowed"
            : "cursor-pointer"
        }
      `}
    >
      {selected && (
        <div className="absolute top-4 right-4 h-6 w-6 rounded-full bg-purple-600 flex items-center justify-center text-xs text-white">
          ✓
        </div>
      )}

      <div className="flex items-start gap-4">
        {icon && (
          <div className="text-2xl">
            {icon}
          </div>
        )}

        <div className="flex-1">

          <div className="flex justify-between items-center">

            <h3 className="text-white font-semibold text-lg">
              {title}
            </h3>

            <span
              className={`font-semibold ${
                price === 0
                  ? "text-green-400"
                  : "text-purple-400"
              }`}
            >
              {price === 0
                ? "FREE"
                : `+$${price}`}
            </span>

          </div>

          <p className="mt-2 text-sm text-slate-400">
            {description}
          </p>

          {disabled && (
            <p className="mt-3 text-xs text-red-400">
              Not available with the selected option.
            </p>
          )}

        </div>
      </div>
    </button>
  );
}