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
      <div className="flex min-h-screen items-center justify-center p-8">
        <p className="text-slate-500">
          Loading support...
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl p-6 md:p-8">
      <CustomerSupportCenter
        customerId={customerId}
      />
    </div>
  );
}
