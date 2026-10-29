"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";

interface Props {
  requestId: string;
  status: string;
}

export default function CheckoutHeader({ requestId, status }: Props) {
  const statusLabel = status
    .replaceAll("_", " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());

  return (
    <section className="app-panel overflow-hidden">
      <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:justify-between sm:p-6">
        <div className="min-w-0">
          <Link
            href={`/requests/${requestId}`}
            className="app-kicker inline-flex items-center gap-1.5 text-[var(--muted)] transition-colors hover:text-[var(--foreground)]"
          >
            <ArrowLeft size={13} />
            Back to request
          </Link>

          <h1 className="app-h1 mt-2">Checkout</h1>
          <p className="app-lead">
            Review your quotation and complete payment securely.
          </p>
        </div>

        <div className="inline-flex shrink-0 items-center gap-2 self-start rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-2.5 py-1.5">
          <span className="text-[11px] text-[var(--muted)]">Status</span>
          <span className="text-[12px] font-medium text-[var(--foreground)]">
            {statusLabel}
          </span>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-[var(--border)] px-5 py-3 sm:px-6">
        <span className="text-[11px] uppercase tracking-[0.12em] text-[var(--muted)]">
          Request
        </span>
        <span className="font-mono text-[13px] font-medium text-[var(--foreground)]">
          #{requestId}
        </span>
      </div>
    </section>
  );
}
