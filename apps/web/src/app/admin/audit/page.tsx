/**
 * @fileoverview Admin audit page — thin composition root.
 *
 * Uses `useAdminAudit` hook for data/business logic and
 * `CustomerSidebarPanel` + `RequestDetailPanel` for presentation.
 */

"use client";

import { ShieldCheck } from "lucide-react";
import { useAdminAudit } from "@/features/admin/hooks/useAdminAudit";
import { CustomerSidebarPanel } from "@/components/admin/audit/CustomerSidebarPanel";
import { RequestDetailPanel } from "@/components/admin/audit/RequestDetailPanel";

export default function AdminAuditPage() {
  const state = useAdminAudit();

  if (state.loading) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center">
        <div className="flex items-center gap-3 text-slate-400">
          <ShieldCheck size={20} className="animate-pulse" />
          Loading audit data...
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[calc(100vh-40px)] flex-col gap-6">
      <div>
        <div className="flex items-center gap-3">
          <ShieldCheck size={26} className="text-red-400" />
          <h1 className="text-2xl font-bold text-white">Audit</h1>
        </div>
        <p className="mt-1 text-sm text-slate-400">
          Review customers, requests, payments and refund activity.
        </p>
      </div>

      <div className="grid min-h-[650px] flex-1 overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 lg:grid-cols-[340px_1fr]">
        <CustomerSidebarPanel
          customers={state.customers}
          filteredCustomers={state.filteredCustomers}
          selectedCustomerId={state.selectedCustomerId}
          search={state.search}
          requests={state.requests}
          onSearchChange={state.setSearch}
          onSelect={state.setSelectedCustomerId}
        />

        <RequestDetailPanel
          selectedCustomer={state.selectedCustomer}
          customerRequests={state.customerRequests}
        />
      </div>
    </div>
  );
}