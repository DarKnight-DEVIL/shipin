/**
 * @fileoverview Shared audit utilities.
 */

import type { Timestamp } from "firebase/firestore";
import type { ReactNode } from "react";

export function formatDate(value: unknown): string {
  if (!value) return "—";
  try {
    if (typeof (value as { toDate?: unknown }).toDate === "function") {
      return (value as Timestamp).toDate().toLocaleString();
    }
    if (typeof value === "string") {
      return new Date(value).toLocaleString();
    }
    if (value instanceof Date) {
      return value.toLocaleString();
    }
    return "—";
  } catch {
    return "—";
  }
}

export function statusLabel(status: string): string {
  return status
    .replaceAll("_", " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function statusClass(status: string): string {
  switch (status) {
    case "refunded":
      return "bg-green-500/10 text-green-400 border-green-500/20";
    case "refund_requested":
      return "bg-red-500/10 text-red-400 border-red-500/20";
    case "refund_offered":
      return "bg-amber-500/10 text-amber-400 border-amber-500/20";
    case "paid":
      return "bg-blue-500/10 text-blue-400 border-blue-500/20";
    case "delivered":
      return "bg-green-500/10 text-green-400 border-green-500/20";
    case "rejected":
      return "bg-red-500/10 text-red-400 border-red-500/20";
    default:
      return "bg-slate-500/10 text-slate-400 border-slate-500/20";
  }
}

interface AuditFieldProps {
  icon?: ReactNode;
  label: string;
  value: string;
}

export function AuditField({ icon, label, value }: AuditFieldProps) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
      <div className="flex items-center gap-2 text-slate-600">
        {icon}
        <span className="text-[11px] font-semibold uppercase tracking-wide">
          {label}
        </span>
      </div>
      <p className="mt-1 truncate text-sm font-medium text-slate-300">
        {value}
      </p>
    </div>
  );
}