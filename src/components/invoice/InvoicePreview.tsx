"use client";

import { PackageOpen } from "lucide-react";
import EmptyState from "@/components/ui/EmptyState";

interface Props {
  invoice: any;
}

export default function InvoicePreview({ invoice }: Props) {
  if (!invoice) return null;

  const originalItems = invoice.originalItems || [];
  const additionalPurchases = invoice.additionalPurchases || [];

  return (
    <article className="app-panel overflow-hidden">
      {/* =====================================
          HEADER
      ====================================== */}
      <header className="flex flex-col gap-5 border-b border-[var(--border)] p-6 sm:flex-row sm:items-start sm:justify-between sm:p-8">
        <div>
          <p className="app-section-title text-[15px]">ShipIN</p>
          <p className="mt-1 text-[12px] text-[var(--muted)]">
            Global shopping &amp; package forwarding
          </p>
          <p className="mt-3 text-[12px] text-[var(--muted)]">
            contact.shipin@gmail.com
          </p>
        </div>

        <div className="sm:text-right">
          <p className="app-kicker">Purchase invoice</p>
          <p className="mt-1.5 font-mono text-[20px] font-semibold tracking-tight text-[var(--foreground)]">
            INV-{invoice.id ?? "Draft"}
          </p>
          <p className="mt-2 text-[12px] tabular-nums text-[var(--muted)]">
            {new Date().toLocaleDateString()}
          </p>
        </div>
      </header>

      {/* =====================================
          CUSTOMER INFORMATION
      ====================================== */}
      <div className="grid grid-cols-1 gap-6 border-b border-[var(--border)] p-6 sm:grid-cols-2 sm:p-8">
        <div>
          <p className="app-kicker">Bill to</p>
          <p className="mt-2 text-[13px] font-semibold text-[var(--foreground)]">
            {invoice.customerName ?? "Customer"}
          </p>
          <p className="mt-0.5 text-[12px] text-[var(--muted)]">
            {invoice.email ?? "No email provided"}
          </p>
        </div>

        <div className="sm:text-right">
          <p className="app-kicker">Order</p>
          <p className="mt-2 break-all font-mono text-[13px] font-semibold text-[var(--foreground)]">
            #{invoice.requestId ?? invoice.id}
          </p>
        </div>
      </div>

      <div className="p-6 sm:p-8">
        {/* =====================================
            ORIGINAL ORDER
        ====================================== */}
        <div>
          <div className="mb-4">
            <h3 className="app-section-title">Original order</h3>
            <p className="mt-1 text-[12px] text-[var(--muted)]">
              Products included in the original purchase request.
            </p>
          </div>

          <InvoiceItemsTable items={originalItems} />

          <div className="mt-6 ml-auto max-w-sm rounded-[14px] border border-[var(--border)] bg-[var(--surface-2)] p-5">
            <div className="space-y-3">
              <Row title="Products" value={invoice.productsTotal} />
              <Row title="Domestic shipping" value={invoice.domesticShipping} />
              <Row
                title="Estimated shipping"
                value={invoice.internationalShipping}
              />
              <Row title="Service fee" value={invoice.serviceFee} />

              <div className="border-t border-[var(--border)] pt-3">
                <div className="flex items-center justify-between gap-4 text-[13px]">
                  <span className="font-semibold text-[var(--foreground)]">
                    Original order total
                  </span>
                  <span className="font-semibold tabular-nums text-[var(--foreground)]">
                    ${(invoice.originalTotal || 0).toFixed(2)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* =====================================
            ADDITIONAL PURCHASES
        ====================================== */}
        {additionalPurchases.length > 0 && (
          <div className="mt-10 border-t border-[var(--border)] pt-8">
            <div className="mb-4">
              <h3 className="app-section-title">Additional purchases</h3>
              <p className="mt-1 text-[12px] text-[var(--muted)]">
                Items added and paid for after the original order.
              </p>
            </div>

            <div className="space-y-4">
              {additionalPurchases.map((purchase: any, index: number) => (
                <div
                  key={purchase.id ?? index}
                  className="rounded-[14px] border border-[var(--border)] p-5"
                >
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <span className="inline-flex items-center rounded-full border border-[var(--border)] bg-[var(--surface-2)] px-2.5 py-0.5 text-[11px] font-medium text-[var(--muted)]">
                        Additional item
                      </span>

                      <p className="mt-2.5 text-[14px] font-semibold text-[var(--foreground)]">
                        {purchase.name}
                      </p>
                      <p className="mt-0.5 text-[12px] text-[var(--muted)]">
                        Quantity: {purchase.quantity}
                      </p>
                    </div>

                    <div className="shrink-0 sm:text-right">
                      <p className="app-kicker">Product subtotal</p>
                      <p className="mt-1 text-[16px] font-semibold tabular-nums text-[var(--foreground)]">
                        ${(purchase.subtotal || 0).toFixed(2)}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 rounded-[14px] bg-[var(--surface-2)] p-4">
                    <div className="space-y-2.5">
                      <Row
                        title={`Unit price × ${purchase.quantity}`}
                        value={purchase.subtotal}
                      />
                      {purchase.serviceFee > 0 && (
                        <Row title="Service fee" value={purchase.serviceFee} />
                      )}
                      {purchase.repackingFee > 0 && (
                        <Row
                          title="Repacking fee"
                          value={purchase.repackingFee}
                        />
                      )}
                      {purchase.storageFee > 0 && (
                        <Row title="Storage fee" value={purchase.storageFee} />
                      )}

                      <div className="border-t border-[var(--border)] pt-3">
                        <div className="flex items-center justify-between gap-4 text-[13px]">
                          <span className="font-semibold text-[var(--foreground)]">
                            Amount paid
                          </span>
                          <span className="font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                            ${(purchase.totalPaid || 0).toFixed(2)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* =====================================
            PAYMENT SUMMARY
        ====================================== */}
        <div className="mt-10 border-t border-[var(--border)] pt-8">
          <h3 className="app-section-title">Payment summary</h3>

          <div className="mt-4 ml-auto max-w-md rounded-[14px] border border-[var(--border)] bg-[var(--surface-2)] p-6">
            <div className="space-y-3">
              <Row title="Original payment" value={invoice.originalTotal} />
              {invoice.additionalTotal > 0 && (
                <Row
                  title="Additional payments"
                  value={invoice.additionalTotal}
                />
              )}

              <div className="border-t border-[var(--border)] pt-4">
                <div className="flex items-center justify-between gap-4">
                  <span className="text-[14px] font-semibold text-[var(--foreground)]">
                    Total paid
                  </span>
                  <span className="text-[20px] font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                    ${(invoice.totalPaid || 0).toFixed(2)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* =====================================
            NOTICE
        ====================================== */}
        <div className="mt-8 rounded-[14px] border border-amber-300/70 bg-amber-50/70 p-5 dark:border-amber-500/25 dark:bg-amber-500/[0.06]">
          <h4 className="text-[13px] font-semibold text-amber-800 dark:text-amber-300">
            Important notice
          </h4>
          <p className="mt-2 text-[12px] leading-6 text-slate-600 dark:text-slate-300">
            The international shipping charge shown above is an estimate. The
            final cost is confirmed after your package reaches the ShipIN
            warehouse — if it differs, only the difference is charged or
            refunded before dispatch.
          </p>
        </div>
      </div>
    </article>
  );
}

/* =========================================
    ITEMS TABLE
========================================= */

function InvoiceItemsTable({ items }: { items: any[] }) {
  if (!items.length) {
    return (
      <EmptyState
        icon={<PackageOpen size={18} />}
        title="No products available"
        description="There are no products to display in this section."
      />
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-[var(--border)]">
            <th className="app-kicker pb-2.5 text-left font-semibold">
              Product
            </th>
            <th className="app-kicker pb-2.5 text-center font-semibold">Qty</th>
            <th className="app-kicker pb-2.5 text-center font-semibold">Unit</th>
            <th className="app-kicker pb-2.5 text-right font-semibold">
              Total
            </th>
          </tr>
        </thead>

        <tbody>
          {items.map((item: any, index: number) => (
            <tr
              key={item.id ?? index}
              className="border-b border-[var(--border)] last:border-b-0"
            >
              <td className="py-3 pr-4 text-[13px] font-medium text-[var(--foreground)]">
                {item.name}
              </td>
              <td className="py-3 text-center text-[13px] tabular-nums text-[var(--muted)]">
                {item.quantity}
              </td>
              <td className="py-3 text-center text-[13px] tabular-nums text-[var(--muted)]">
                ${(item.unitPrice || 0).toFixed(2)}
              </td>
              <td className="py-3 pl-4 text-right text-[13px] font-medium tabular-nums text-[var(--foreground)]">
                ${(item.subtotal || 0).toFixed(2)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* =========================================
    MONEY ROW
========================================= */

function Row({ title, value }: { title: string; value?: number }) {
  return (
    <div className="flex justify-between gap-4 text-[13px]">
      <span className="text-[var(--muted)]">{title}</span>
      <span className="font-medium tabular-nums text-[var(--foreground)]">
        ${(value || 0).toFixed(2)}
      </span>
    </div>
  );
}
