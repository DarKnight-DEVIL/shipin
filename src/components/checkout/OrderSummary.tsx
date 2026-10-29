"use client";

import type { Request } from "@/types/request";
import { Package, ExternalLink } from "lucide-react";

interface Props {
  request: Request;
}

export default function OrderSummary({ request }: Props) {
  return (
    <section className="app-panel overflow-hidden">
      <div className="flex items-baseline justify-between gap-3 border-b border-[var(--border)] px-5 py-3.5">
        <div>
          <h2 className="text-[13px] font-semibold text-[var(--foreground)]">
            Items in this order
          </h2>
          <p className="mt-0.5 text-[12px] text-[var(--muted)]">
            {request.items.length} item
            {request.items.length !== 1 && "s"}
          </p>
        </div>
      </div>

      <div className="divide-y divide-[var(--border)]">
        {request.items.map((item, index) => (
          <div key={index} className="flex gap-4 p-5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--surface-2)] text-[var(--muted)]">
              <Package size={15} />
            </span>

            <div className="min-w-0 flex-1">
              <h3 className="text-[13px] font-medium text-[var(--foreground)]">
                {item.name}
              </h3>

              <p className="mt-0.5 text-[12px] text-[var(--muted)]">
                Quantity: {item.quantity}
              </p>

              {item.url && (
                <a
                  href={item.url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2.5 inline-flex items-center gap-1.5 text-[12px] font-medium text-blue-600 transition-colors hover:text-blue-500 dark:text-blue-400 dark:hover:text-blue-300"
                >
                  View product
                  <ExternalLink size={13} />
                </a>
              )}
            </div>

            <div className="shrink-0 text-right">
              {item.unitPrice !== undefined && (
                <>
                  <p className="text-[11px] uppercase tracking-[0.1em] text-[var(--muted)]">
                    Unit price
                  </p>
                  <p className="mt-0.5 text-[13px] font-medium tabular-nums text-[var(--foreground)]">
                    ${item.unitPrice.toFixed(2)}
                  </p>
                </>
              )}

              {item.subtotal !== undefined && (
                <>
                  <p className="mt-3 text-[11px] uppercase tracking-[0.1em] text-[var(--muted)]">
                    Subtotal
                  </p>
                  <p className="mt-0.5 text-[16px] font-semibold tabular-nums text-[var(--foreground)]">
                    ${item.subtotal.toFixed(2)}
                  </p>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
