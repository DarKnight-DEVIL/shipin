"use client";

import {
  ShieldCheck,
  Lock,
  BadgeCheck,
  FileCheck,
} from "lucide-react";

export default function SecurityCard() {
  return (
    <section className="app-panel overflow-hidden">
      {/* Header */}
      <div className="border-b border-[var(--border)] px-5 py-3.5">
        <div className="flex items-center gap-2.5">
          <ShieldCheck size={16} className="text-emerald-600 dark:text-emerald-400" />
          <div>
            <h2 className="text-[13px] font-semibold text-[var(--foreground)]">
              Secure checkout
            </h2>
            <p className="mt-0.5 text-[12px] text-[var(--muted)]">
              Your payment is protected with industry-standard security.
            </p>
          </div>
        </div>
      </div>

      {/* Features */}
      <div className="divide-y divide-[var(--border)]">
        <Feature
          icon={<Lock size={15} />}
          title="256-bit SSL encryption"
          description="Payment information is encrypted during transmission."
        />

        <Feature
          icon={<BadgeCheck size={15} />}
          title="PayPal Buyer Protection"
          description="Eligible purchases are covered by PayPal’s Buyer Protection policy."
        />

        <Feature
          icon={<FileCheck size={15} />}
          title="Verified transactions"
          description="Every payment is verified before your order enters purchasing."
        />
      </div>

      {/* Footer */}
      <div className="border-t border-[var(--border)] bg-[var(--surface-2)] px-5 py-3.5">
        <p className="text-[12px] leading-5 text-[var(--muted)]">
          Your financial information is never stored on ShipIN — payments are
          processed by PayPal.
        </p>
      </div>
    </section>
  );
}

function Feature({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="flex gap-3 px-5 py-4">
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[var(--surface-2)] text-[var(--muted)]">
        {icon}
      </span>

      <div className="min-w-0">
        <h3 className="text-[13px] font-medium text-[var(--foreground)]">
          {title}
        </h3>
        <p className="mt-0.5 text-[12px] leading-5 text-[var(--muted)]">
          {description}
        </p>
      </div>
    </div>
  );
}
