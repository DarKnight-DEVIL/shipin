"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { getRequestById } from "@/lib/firestore";
import { getWallet } from "@/lib/wallet";
import { isQuoteExpired } from "@/lib/quoteExpiry";
import PageSkeleton from "@/components/ui/PageSkeleton";
import type { Request } from "@/types/request";

import PaymentCard from "@/components/checkout/PaymentCard";

export default function PaymentPage() {

  const { id } = useParams();

  const router = useRouter();

  const [request, setRequest] =
    useState<Request | null>(null);

  const [walletBalance, setWalletBalance] =
    useState(0);

  const [loading, setLoading] =
    useState(true);

  useEffect(() => {

    async function load() {

      const data =
        await getRequestById(id as string);

      if (!data) {
        router.push("/requests");
        return;
      }

      if (data.status === "paid") {
        router.push(`/requests/${data.id}`);
        return;
      }

      const wallet =
        await getWallet(data.userId);

      setWalletBalance(wallet.balance);

      setRequest(data);

      setLoading(false);

    }

    load();

  }, [id]);

  if (loading) {
    return (
      <div className="p-8">
        <PageSkeleton />
      </div>
    );
  }

  if (!request) return null;

  const quoteExpired = isQuoteExpired(
    request.quote?.expiresAt
  );

  return (
    <div className="max-w-5xl mx-auto p-8">

      {quoteExpired ? (

        <div className="rounded-3xl border border-red-200 bg-white shadow-sm dark:border-red-900/40 dark:bg-slate-900">

          <div className="border-b border-slate-200 dark:border-slate-800 p-8">

            <div className="flex items-center gap-4">

              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-red-100 dark:bg-red-500/15">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-7 w-7 text-red-600 dark:text-red-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 9v4m0 4h.01M10.29 3.86L1.82 18A2 2 0 003.53 21h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
                  />
                </svg>
              </div>

              <div>

                <h1 className="text-3xl font-bold text-slate-900 dark:text-white">
                  Quote Expired
                </h1>

                <p className="mt-1 text-slate-500 dark:text-slate-400">
                  This quotation is no longer valid.
                </p>

              </div>

            </div>

          </div>

          <div className="space-y-6 p-8">

            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 dark:border-amber-500/20 dark:bg-amber-500/10">

              <p className="font-semibold text-amber-700 dark:text-amber-300">
                Why?
              </p>

              <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                Product prices, domestic shipping and international shipping
                costs may have changed since this quotation was generated.
              </p>

            </div>

            <button
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
              className="w-full rounded-2xl bg-blue-600 py-4 text-lg font-semibold text-white transition hover:bg-blue-700"
            >
              Request New Quote
            </button>

          </div>

        </div>

      ) : (

        <PaymentCard
          request={request}
          walletBalance={walletBalance}
        />

      )}

    </div>
  );

}