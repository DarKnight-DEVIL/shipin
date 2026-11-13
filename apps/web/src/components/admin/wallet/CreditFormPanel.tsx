/**
 * @fileoverview Credit/refund form panel for admin wallet page.
 */

"use client";

import { AlertCircle, CheckCircle2, Loader2, Plus } from "lucide-react";
import type { AdminCustomer } from "@/features/admin/services/customers";

interface CreditFormPanelProps {
  selectedCustomer: AdminCustomer | null;
  amount: string;
  description: string;
  adding: boolean;
  successMessage: string;
  errorMessage: string;
  refundMode: boolean;
  refundLoading: boolean;
  onAmountChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onSubmit: () => void;
}

export function CreditFormPanel({
  selectedCustomer,
  amount,
  description,
  adding,
  successMessage,
  errorMessage,
  refundMode,
  refundLoading,
  onAmountChange,
  onDescriptionChange,
  onSubmit,
}: CreditFormPanelProps) {
  if (refundLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 size={24} className="animate-spin text-purple-400" />
      </div>
    );
  }

  if (!selectedCustomer) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-slate-800">
          <UserIcon />
        </div>
        <p className="text-slate-400">Select a customer to continue.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-slate-800 text-sm font-semibold text-slate-300">
            {selectedCustomer.displayName.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="truncate text-base font-medium text-white">
              {selectedCustomer.displayName}
            </p>
            <p className="truncate text-xs text-slate-400">
              {selectedCustomer.email}
            </p>
          </div>
        </div>
        <p className="mt-3 text-sm">
          <span className="text-slate-500">Current balance: </span>
          <span
            className={`font-semibold ${
              selectedCustomer.walletBalance >= 0
                ? "text-green-400"
                : "text-red-400"
            }`}
          >
            ${selectedCustomer.walletBalance.toFixed(2)}
          </span>
        </p>
      </div>

      <div>
        <label
          htmlFor="wallet-amount"
          className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500"
        >
          Amount (USD)
        </label>
        <div className="relative">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500">
            $
          </span>
          <input
            id="wallet-amount"
            type="number"
            min="0"
            step="0.01"
            value={amount}
            onChange={(event) => onAmountChange(event.target.value)}
            placeholder="0.00"
            className="w-full rounded-xl border border-slate-800 bg-slate-900/60 py-3 pl-8 pr-4 text-lg font-medium text-white placeholder-slate-600 focus:border-purple-500/50 focus:outline-none focus:ring-1 focus:ring-purple-500/50"
          />
        </div>
      </div>

      <div>
        <label
          htmlFor="wallet-description"
          className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500"
        >
          Description (optional)
        </label>
        <input
          id="wallet-description"
          type="text"
          value={description}
          onChange={(event) => onDescriptionChange(event.target.value)}
          placeholder={refundMode ? "Refund" : "Admin credit"}
          className="w-full rounded-xl border border-slate-800 bg-slate-900/60 py-3 px-4 text-sm text-white placeholder-slate-600 focus:border-purple-500/50 focus:outline-none focus:ring-1 focus:ring-purple-500/50"
        />
      </div>

      {successMessage && (
        <div className="flex gap-3 rounded-xl border border-green-500/20 bg-green-500/5 p-4">
          <CheckCircle2 size={19} className="mt-0.5 shrink-0 text-green-400" />
          <p className="text-sm text-green-300">{successMessage}</p>
        </div>
      )}

      {errorMessage && (
        <div className="flex gap-3 rounded-xl border border-red-500/20 bg-red-500/5 p-4">
          <AlertCircle size={19} className="mt-0.5 shrink-0 text-red-400" />
          <p className="text-sm text-red-300">{errorMessage}</p>
        </div>
      )}

      <button
        type="button"
        onClick={onSubmit}
        disabled={adding || !amount || Number(amount) <= 0}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3.5 font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {adding ? (
          <>
            <Loader2 size={18} className="animate-spin" />
            {refundMode ? "Authorizing Refund..." : "Adding Credits..."}
          </>
        ) : refundMode ? (
          <>
            <CheckCircle2 size={18} />
            Authorize Refund
          </>
        ) : (
          <>
            <Plus size={18} />
            Add Credits
          </>
        )}
      </button>

      <p className="text-center text-xs leading-5 text-slate-600">
        {refundMode
          ? "This refund will be recorded in the customer's wallet transaction history and linked to this request."
          : "This action will be recorded in the customer's wallet transaction history."}
      </p>
    </div>
  );
}

function UserIcon() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-slate-500"
    >
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c0-4 4-6 8-6s8 2 8 6" />
    </svg>
  );
}