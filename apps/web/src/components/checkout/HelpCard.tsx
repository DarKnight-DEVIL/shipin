"use client";

import Link from "next/link";
import {
  LifeBuoy,
  MessageCircle,
  Mail,
  ArrowRight,
  Clock3,
} from "lucide-react";

export default function HelpCard() {
  return (
    <section className="app-panel overflow-hidden">
      {/* Header */}
      <div className="border-b border-[var(--border)] px-5 py-3.5">
        <div className="flex items-center gap-2.5">
          <LifeBuoy size={16} className="text-[var(--muted)]" />
          <div>
            <h2 className="text-[13px] font-semibold text-[var(--foreground)]">
              Need a hand?
            </h2>
            <p className="mt-0.5 text-[12px] text-[var(--muted)]">
              Our team is here before and after your payment.
            </p>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="grid gap-4 p-5 md:grid-cols-2">
        <div className="flex flex-col rounded-[14px] border border-[var(--border)] bg-[var(--surface-2)] p-5">
          <div className="flex items-start gap-3">
            <MessageCircle
              size={16}
              className="mt-0.5 shrink-0 text-blue-600 dark:text-blue-400"
            />

            <div className="min-w-0">
              <h3 className="text-[13px] font-medium text-[var(--foreground)]">
                Support ticket
              </h3>
              <p className="mt-0.5 text-[12px] leading-5 text-[var(--muted)]">
                Open a thread and we&apos;ll pick it up from there.
              </p>
            </div>
          </div>

          <Link
            href="/support"
            className="app-btn app-btn-primary mt-4 self-start"
          >
            Open support
            <ArrowRight size={14} />
          </Link>
        </div>

        <div className="flex flex-col rounded-[14px] border border-[var(--border)] bg-[var(--surface-2)] p-5">
          <div className="flex items-start gap-3">
            <Mail
              size={16}
              className="mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-400"
            />

            <div className="min-w-0">
              <h3 className="text-[13px] font-medium text-[var(--foreground)]">
                Email support
              </h3>
              <p className="mt-0.5 break-all text-[12px] text-[var(--muted)]">
                contact.shipin@gmail.com
              </p>
            </div>
          </div>

          <div className="mt-4 flex items-center gap-2 text-[12px] text-[var(--muted)]">
            <Clock3 size={14} className="shrink-0" />
            Average reply under 24 hours
          </div>
        </div>
      </div>
    </section>
  );
}
