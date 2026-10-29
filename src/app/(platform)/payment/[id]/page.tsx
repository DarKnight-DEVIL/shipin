"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AlertTriangle, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { getRequestById } from "@/lib/firestore";
import { getWallet } from "@/lib/wallet";
import { isQuoteExpired } from "@/lib/quoteExpiry";
import PageSkeleton from "@/components/ui/PageSkeleton";
import PageHeader from "@/components/ui/PageHeader";
import type { Request } from "@/types/request";

import PaymentCard from "@/components/checkout/PaymentCard";

export default function PaymentPage() {
  const { id } = useParams();

  const router = useRouter();

  const [request, setRequest] = useState<Request | null>(null);

  const [walletBalance, setWalletBalance] = useState(0);

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const data = await getRequestById(id as string);

        if (!data) {
          router.push("/requests");
          return;
        }

        if (data.status === "paid") {
          router.push(`/requests/${data.id}`);
          return;
        }

        const wallet = await getWallet(data.userId);

        setWalletBalance(wallet.balance);
        setRequest(data);
      } catch (error) {
        console.error("Payment loading failed:", error);
        router.push("/requests");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [id]);

  if (loading) {
    return (
      <div className="app-page">
        <PageSkeleton />
      </div>
    );
  }

  if (!request) return null;

  const quoteExpired = isQuoteExpired(request.quote?.expiresAt);

  if (quoteExpired) {
    return (
      <div className="app-page">
        <PageHeader
          backHref={`/requests/${request.id}`}
          backLabel="Request"
          eyebrow="Payment"
          title="Quote expired"
          subtitle="This quotation is no longer valid."
        />

        <section className="app-panel max-w-2xl p-5">
          <div className="flex items-start gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400">
              <AlertTriangle size={15} />
            </div>

            <div>
              <h2 className="text-[13px] font-semibold text-[var(--foreground)]">
                Prices need to be refreshed
              </h2>
              <p className="mt-1 text-[12px] leading-5 text-[var(--muted)]">
                Product prices, domestic shipping and international shipping
                costs may have changed since this quotation was generated.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={async () => {
              const response = await fetch(
                `/api/requests/${request.id}/request-new-quote`,
                {
                  method: "POST",
                }
              );

              if (!response.ok) {
                toast.error("Unable to request a new quote.");
                return;
              }

              router.push(`/requests/${request.id}`);
            }}
            className="app-btn app-btn-primary mt-5"
          >
            Request new quote
            <ArrowRight size={14} />
          </button>
        </section>
      </div>
    );
  }

  return (
    <div className="app-page">
      <PageHeader
        backHref={`/requests/${request.id}`}
        backLabel="Request"
        eyebrow="Payment"
        title="Payment"
        subtitle="Review your quote and choose how to pay"
      />

      <div className="max-w-2xl">
        <PaymentCard request={request} walletBalance={walletBalance} />
      </div>
    </div>
  );
}
