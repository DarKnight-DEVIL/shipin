/**
 * @fileoverview Customer sidebar panel for admin audit page.
 *
 * Renders the search box and customer list. Selecting a customer
 * triggers a callback to update the parent page's state.
 */

"use client";

import Image from "next/image";
import { Search, User } from "lucide-react";
import type { AdminCustomer } from "@/features/admin/services/customers";
import type { Request } from "@/types/request";

interface CustomerSidebarPanelProps {
  customers: AdminCustomer[];
  filteredCustomers: AdminCustomer[];
  selectedCustomerId: string | null;
  search: string;
  requests: Request[];
  onSearchChange: (value: string) => void;
  onSelect: (id: string) => void;
}

export function CustomerSidebarPanel({
  filteredCustomers,
  selectedCustomerId,
  search,
  requests,
  onSearchChange,
  onSelect,
}: CustomerSidebarPanelProps) {
  return (
    <aside className="flex flex-col border-b border-slate-800 lg:border-b-0 lg:border-r">
      <div className="border-b border-slate-800 p-4">
        <div className="relative">
          <Search
            size={17}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
          />
          <input
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Search customers..."
            className="w-full rounded-xl border border-slate-800 bg-slate-900/60 py-2.5 pl-9 pr-3 text-sm text-white placeholder-slate-500 focus:border-purple-500/50 focus:outline-none focus:ring-1 focus:ring-purple-500/50"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {filteredCustomers.length === 0 ? (
          <div className="p-6 text-center text-sm text-slate-500">
            No customers found.
          </div>
        ) : (
          filteredCustomers.map((customer) => {
            const selected = customer.id === selectedCustomerId;
            const requestCount = requests.filter(
              (request) => request.userId === customer.id
            ).length;

            return (
              <button
                key={customer.id}
                type="button"
                onClick={() => onSelect(customer.id)}
                className={`flex w-full items-center gap-3 border-b border-slate-800 p-4 text-left transition ${
                  selected ? "bg-slate-800" : "hover:bg-slate-950"
                }`}
                aria-label={`Select customer ${customer.displayName ?? customer.id}`}
              >
                <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-800">
                  {customer.photoURL ? (
                  <Image
                    src={customer.photoURL}
                    width={44}
                    height={44}
                    alt={customer.displayName}
                    className="h-full w-full rounded-full object-cover"
                  />
                  ) : (
                    <User size={18} className="text-slate-500" />
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-white">
                    {customer.displayName}
                  </p>
                  <p className="truncate text-xs text-slate-500">
                    {customer.email}
                  </p>
                  <div className="mt-1 flex items-center gap-2 text-[11px] text-slate-500">
                    <span>
                      {requestCount}{" "}
                      request{requestCount === 1 ? "" : "s"}
                    </span>
                    <span>•</span>
                    <span>${customer.walletBalance.toFixed(2)}</span>
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>
    </aside>
  );
}