/**
 * @fileoverview Customer request detail panel for admin audit page.
 * Renders customer information and their request list with status, payment,
 * and warehouse details. Designed to be a pure presentation component.
 */
"use client";

import Image from "next/image";
import {
  Clock, CreditCard, Package, RotateCcw, ShieldCheck, Wallet
} from "lucide-react";
import type { Request } from "@/types/request";
import type { AdminCustomer } from "@/features/admin/services/customers";
import { AuditField, formatDate, statusLabel, statusClass } from "./AuditField";

interface RequestDetailPanelProps {
  selectedCustomer: AdminCustomer | null;
  customerRequests: Request[];
}

export function RequestDetailPanel({
  selectedCustomer,
  customerRequests,
}: RequestDetailPanelProps) {
  if (!selectedCustomer) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center p-8">
        <div className="text-center text-slate-500">
          <ShieldCheck size={48} className="mx-auto mb-4 opacity-50" />
          <p className="text-lg">Select a customer to view details</p>
          <p className="mt-2 text-sm">Choose from the customer list on the left</p>
        </div>
      </div>
    );
  }

  const requestCount = customerRequests.length;
  const totalSpent = customerRequests.reduce((sum, req) => sum + (req.payment?.amount ?? 0), 0);

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-slate-950 p-6">
      <div className="mb-6 flex items-start gap-4 rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
        <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-800">
          {selectedCustomer.photoURL ? (
            <Image
              src={selectedCustomer.photoURL}
              width={80}
              height={80}
              alt={selectedCustomer.displayName}
              className="h-full w-full rounded-full object-cover"
              referrerPolicy="no-referrer"
            />
          ) : (
            <span className="text-3xl text-slate-600">👤</span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-2xl font-bold text-white">{selectedCustomer.displayName}</h2>
          <p className="truncate text-sm text-slate-400">{selectedCustomer.email}</p>
          <div className="mt-3 flex flex-wrap gap-4 text-sm">
            <div className="flex items-center gap-2"><Package size={16} className="text-slate-500" />
              <span className="text-slate-300">{requestCount} requests</span>
            </div>
            <div className="flex items-center gap-2"><Wallet size={16} className="text-slate-500" />
              <span className="text-slate-300">${selectedCustomer.walletBalance.toFixed(2)}</span>
            </div>
            <div className="flex items-center gap-2"><CreditCard size={16} className="text-slate-500" />
              <span className="text-slate-300">${totalSpent.toFixed(2)} spent</span>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1">
        <h3 className="mb-4 text-lg font-semibold text-white">Requests ({requestCount})</h3>
        {customerRequests.length === 0 ? (
          <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-8 text-center">
            <Package size={32} className="mx-auto mb-3 text-slate-600" />
            <p className="text-slate-400">No requests found</p>
          </div>
        ) : (
          <div className="space-y-4">
            {customerRequests.map((request) => (
              <RequestCard key={request.id} request={request} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function RequestCard({ request }: { request: Request }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-5 hover:bg-slate-900/60 transition">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className="truncate font-mono text-xs text-slate-500">{request.id.slice(0, 12)}...</p>
          <p className="mt-1 text-sm font-medium text-slate-300">
            {request.items?.[0]?.name || "Request"}
          </p>
          <p className="mt-1 text-xs text-slate-500">{request.items?.length || 0} item(s)</p>
        </div>
        <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${statusClass(request.status)}`}>
          {statusLabel(request.status)}
        </span>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <AuditField icon={<Clock size={15} />} label="Created" value={formatDate(request.createdAt)} />
        <AuditField icon={<Clock size={15} />} label="Updated" value={formatDate(request.updatedAt)} />
        <AuditField icon={<CreditCard size={15} />} label="Payment" 
          value={request.payment ? `$${Number(request.payment.amount ?? 0).toFixed(2)}` : "No payment"} />
        <AuditField icon={<Package size={15} />} label="Status" value={statusLabel(request.status)} />
      </div>
      {request.refundRequest && (
        <div className="mt-4 rounded-lg border border-red-500/20 bg-red-500/5 p-3">
          <div className="flex items-center gap-2">
            <RotateCcw size={14} className="text-red-400" />
            <p className="text-xs font-semibold text-red-300">Refund Request</p>
          </div>
          <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
            <div><p className="text-slate-600">Status</p><p className="text-slate-300">{request.refundRequest.status}</p></div>
            <div><p className="text-slate-600">Preference</p><p className="text-slate-300">{request.refundRequest.preference}</p></div>
            <div><p className="text-slate-600">Amount</p><p className="text-slate-300">${Number(request.refundRequest.amount ?? 0).toFixed(2)}</p></div>
          </div>
        </div>
      )}
    </div>
  );
}