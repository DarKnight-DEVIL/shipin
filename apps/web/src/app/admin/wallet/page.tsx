"use client";

/**
 * @fileoverview Admin wallet page — thin composition root.
 *
 * Uses `useAdminWallet` hook for data/business logic and
 * `CustomerListPanel` + `CreditFormPanel` for presentation.
 */

import { Wallet } from "lucide-react";
import dynamic from "next/dynamic";

const CustomerListPanel = dynamic(
  () => import("@/components/admin/wallet/CustomerListPanel").then((mod) => mod.CustomerListPanel),
  { ssr: false, loading: () => <div className="h-full animate-pulse" /> }
);

const CreditFormPanel = dynamic(
  () => import("@/components/admin/wallet/CreditFormPanel").then((mod) => mod.CreditFormPanel),
  { ssr: false, loading: () => <div className="h-64 animate-pulse rounded-2xl border border-slate-800 bg-slate-900" /> }
);

import { useAdminWallet } from "@/features/admin/hooks/useAdminWallet";

export default function AdminWalletPage() {
  const state = useAdminWallet();

  if (state.loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-950 text-white">
        <div className="text-center">
          <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-slate-700 border-t-purple-400" />
          <p className="text-sm text-slate-400">Loading customers...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen overflow-hidden bg-slate-950 text-white">
      <div className="flex h-full">
        <aside className="w-80 shrink-0 border-r border-slate-800 bg-slate-900/40">
          <div className="border-b border-slate-800 p-5">
            <h1 className="flex items-center gap-2 text-xl font-bold">
              <Wallet size={22} className="text-purple-400" />
              Wallet Credits
            </h1>
            <p className="mt-1 text-xs text-slate-400">
              Manage customer wallet balances and refunds.
            </p>
          </div>
          <CustomerListPanel
            customers={state.customers}
            search={state.search}
            selectedCustomer={state.selectedCustomer}
            onSearchChange={state.setSearch}
            onSelect={state.setSelectedCustomer}
          />
        </aside>

        <main className="flex-1 overflow-y-auto p-8">
          <CreditFormPanel
            selectedCustomer={state.selectedCustomer}
            amount={state.amount}
            description={state.description}
            adding={state.adding}
            successMessage={state.successMessage}
            errorMessage={state.errorMessage}
            refundMode={state.refundMode}
            refundLoading={state.refundLoading}
            onAmountChange={state.setAmount}
            onDescriptionChange={state.setDescription}
            onSubmit={state.handleAddCredits}
          />
        </main>
      </div>
    </div>
  );
}