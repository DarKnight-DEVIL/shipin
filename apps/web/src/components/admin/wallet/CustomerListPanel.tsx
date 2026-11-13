/**
 * @fileoverview Customer list panel for admin wallet page.
 *
 * Renders the searchable customer list sidebar. Selecting a customer
 * populates the credit form in the parent page.
 */

"use client";

import { Search } from "lucide-react";
import type { AdminCustomer } from "@/features/admin/services/customers";

interface CustomerListPanelProps {
  customers: AdminCustomer[];
  search: string;
  selectedCustomer: AdminCustomer | null;
  onSearchChange: (value: string) => void;
  onSelect: (customer: AdminCustomer) => void;
}

export function CustomerListPanel({
  customers,
  search,
  selectedCustomer,
  onSearchChange,
  onSelect,
}: CustomerListPanelProps) {
  const filtered = customers.filter((customer) => {
    const query = search.trim().toLowerCase();
    if (!query) return true;
    return (
      customer.displayName.toLowerCase().includes(query) ||
      customer.email.toLowerCase().includes(query) ||
      customer.id.toLowerCase().includes(query)
    );
  });

  return (
    <div className="flex h-full flex-col">
      <div className="relative">
        <Search
          size={16}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
        />
        <input
          type="text"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search customers..."
          className="w-full rounded-xl border border-slate-800 bg-slate-900/60 py-2.5 pl-9 pr-3 text-sm text-white placeholder-slate-500 focus:border-purple-500/50 focus:outline-none focus:ring-1 focus:ring-purple-500/50"
        />
      </div>

      <div className="mt-3 flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-500">
            No customers found.
          </p>
        ) : (
          <div className="space-y-2">
            {filtered.map((customer) => (
              <button
                key={customer.id}
                type="button"
                onClick={() => onSelect(customer)}
                className={`w-full rounded-xl border p-3 text-left transition ${
                  selectedCustomer?.id === customer.id
                    ? "border-purple-500/40 bg-purple-500/10"
                    : "border-slate-800 bg-slate-900/60 hover:border-slate-700"
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-800 text-sm font-semibold text-slate-300">
                    {customer.displayName.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-white">
                      {customer.displayName}
                    </p>
                    <p className="truncate text-xs text-slate-400">
                      {customer.email}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p
                      className={`text-sm font-semibold ${
                        customer.walletBalance >= 0
                          ? "text-green-400"
                          : "text-red-400"
                      }`}
                    >
                      ${customer.walletBalance.toFixed(2)}
                    </p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}