"use client";

import {
  ShieldCheck,
  Lock,
  BadgeCheck,
  FileCheck,
} from "lucide-react";

export default function SecurityCard() {
  return (
    <section className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 backdrop-blur-xl shadow-sm dark:shadow-none">

      {/* Header */}

      <div className="border-b border-slate-200 dark:border-slate-800 p-8">

        <div className="flex items-center gap-3">

          <ShieldCheck
            className="text-green-400"
            size={26}
          />

          <div>

            <h2 className="text-2xl font-bold">
              Secure Checkout
            </h2>

            <p className="mt-1 text-sm text-slate-400">
              Your payment is protected with industry-standard security.
            </p>

          </div>

        </div>

      </div>

      {/* Features */}

      <div className="space-y-5 p-8">

        <Feature
          icon={<Lock size={22} />}
          title="256-bit SSL Encryption"
          description="All payment information is securely encrypted during transmission."
        />

        <Feature
          icon={<BadgeCheck size={22} />}
          title="PayPal Buyer Protection"
          description="Eligible purchases are protected under PayPal's Buyer Protection policy."
        />

        <Feature
          icon={<FileCheck size={22} />}
          title="Verified Transactions"
          description="Every payment is verified before your order enters the purchasing stage."
        />

      </div>

      {/* Footer */}

      <div className="border-t border-slate-200 dark:border-slate-800 bg-green-50 dark:bg-green-500/10 p-8">

        <div className="rounded-2xl border border-green-500/20 bg-green-500/10 p-4">

          <p className="text-center text-sm text-green-300">
            🔒 Your financial information is never stored on ShipIN.
            Payments are securely processed by PayPal.
          </p>

        </div>

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
    <div className="flex gap-4">

      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-600/10 text-blue-400">

        {icon}

      </div>

      <div>

        <h3 className="font-semibold">
          {title}
        </h3>

        <p className="mt-1 text-sm leading-6 text-slate-400">
          {description}
        </p>

      </div>

    </div>
  );
}