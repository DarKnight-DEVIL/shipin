"use client";

import { useEffect, useState } from "react";
import { auth } from "@/lib/firebase";
import CustomerSupportCenter from "@/components/support/CustomerSupportCenter";

export default function SupportPage() {
  const [customerId, setCustomerId] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      setCustomerId(user?.uid ?? null);
    });
    return unsubscribe;
  }, []);

  if (!customerId) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
        <div className="mb-6 h-7 w-28 animate-pulse rounded-lg bg-slate-200 dark:bg-slate-800" />
        <div className="h-[560px] animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800/50" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">
          Support
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Conversations about your requests and refunds
        </p>
      </div>

      <CustomerSupportCenter customerId={customerId} />
    </div>
  );
}