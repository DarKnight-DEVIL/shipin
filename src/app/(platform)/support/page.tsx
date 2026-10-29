"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { MessageCircle } from "lucide-react";
import { auth } from "@/lib/firebase";
import CustomerSupportCenter from "@/components/support/CustomerSupportCenter";
import PageHeader from "@/components/ui/PageHeader";
import EmptyState from "@/components/ui/EmptyState";

export default function SupportPage() {
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      setCustomerId(user?.uid ?? null);
      setCheckingSession(false);
    });
    return unsubscribe;
  }, []);

  if (checkingSession) {
    return (
      <div className="app-page">
        <div className="mb-6 h-6 w-28 animate-pulse rounded bg-[var(--surface-3)]" />
        <div className="app-panel h-[560px] animate-pulse" />
      </div>
    );
  }

  if (!customerId) {
    return (
      <div className="app-page">
        <PageHeader
          title="Support"
          subtitle="Conversations about your requests and refunds"
        />

        <EmptyState
          icon={<MessageCircle size={18} />}
          title="Sign in to open support"
          description="Threads and replies live inside your account. Sign in to start a conversation or follow an existing one."
          action={
            <Link href="/login" className="app-btn app-btn-primary">
              Sign in
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="app-page">
      <PageHeader
        title="Support"
        subtitle="Conversations about your requests and refunds"
      />

      <CustomerSupportCenter customerId={customerId} />
    </div>
  );
}