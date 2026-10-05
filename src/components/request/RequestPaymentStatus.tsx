"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Wallet,
  CreditCard,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
} from "lucide-react";
import { doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { toast } from "sonner";
import { db } from "@/lib/firebase";
import type { Request } from "@/types/request";
import { isQuoteExpired } from "@/lib/quoteExpiry";

interface Props {
  request: Request;
  onApproveQuote?: () => void;
  approving?: boolean;
}

export default function RequestPaymentStatus({
  request,
  onApproveQuote,
  approving = false,
}: Props) {
  const router = useRouter();
  const [requestingQuote, setRequestingQuote] = useState(false);

  if (!request.quote) return null;

  const paid = Boolean(request.payment);
  const expired = isQuoteExpired(request.quote.expiresAt);

  // Only pre-payment statuses care about expiry
  const prePayment =
    request.status === "review" || request.status === "awaiting_payment";

  const regenerationAlreadyRequested = Boolean(
    (request as any).quoteRegenerationRequested ||
      request.quote?.regenerationRequested
  );

  async function handleRequestNewQuote() {
    if (regenerationAlreadyRequested || requestingQuote) return;

    try {
      setRequestingQuote(true);
      await updateDoc(doc(db, "requests", request.id), {
        quoteRegenerationRequested: true,
        quoteRequestedAt: serverTimestamp(),
        "quote.regenerationRequested": true,
        "quote.expired": true,
      });

      toast.success("New quote requested", {
        description:
          "Our team will send an updated quote. You'll be notified when it's ready.",
      });
    } catch (error) {
      console.error(error);
      toast.error("Could not request a new quote.", {
        description:
          error instanceof Error ? error.message : "Please try again.",
      });
    } finally {
      setRequestingQuote(false);
    }
  }

  /* ─── Already paid — expiry irrelevant ─── */
  if (paid) {
    const payment = request.payment as {
      paymentMethod?: string;
      provider?: string;
      amountPaid?: number;
      amount?: number;
      walletAmount?: number;
      paypalAmount?: number;
    };

    const paymentMethod =
      payment.paymentMethod || payment.provider || "paypal";
    const walletAmount = Number(payment.walletAmount || 0);
    const paypalAmount = Number(payment.paypalAmount || 0);
    const totalPaid = Number(payment.amountPaid ?? payment.amount ?? 0);

    let paymentMethodLabel = "PayPal";
    if (paymentMethod === "wallet") paymentMethodLabel = "Wallet";
    if (
      paymentMethod === "wallet_and_paypal" ||
      paymentMethod === "paypal_and_wallet"
    ) {
      paymentMethodLabel = "Wallet + PayPal";
    }

    return (
      <div className="shipin-surface p-5">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-500/10">
            <CheckCircle2 size={20} className="text-emerald-500" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-slate-950 dark:text-white">
              Payment received
            </h2>
            <p className="text-xs text-emerald-500">Completed successfully</p>
          </div>
        </div>

        <div className="mt-4 space-y-3 border-t border-slate-200 pt-4 dark:border-slate-800">
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-500">Method</span>
            <span className="inline-flex items-center gap-1.5 font-medium text-slate-900 dark:text-white">
              {paymentMethod === "wallet" && (
                <Wallet size={15} className="text-blue-500" />
              )}
              {(paymentMethod === "paypal" ||
                paymentMethod === "wallet_and_paypal" ||
                paymentMethod === "paypal_and_wallet") && (
                <CreditCard size={15} className="text-purple-400" />
              )}
              {paymentMethodLabel}
            </span>
          </div>

          {walletAmount > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Wallet</span>
              <span className="font-medium text-blue-500">
                −${walletAmount.toFixed(2)}
              </span>
            </div>
          )}

          {paypalAmount > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">PayPal</span>
              <span className="font-medium text-slate-900 dark:text-white">
                ${paypalAmount.toFixed(2)}
              </span>
            </div>
          )}

          <div className="flex justify-between border-t border-slate-200 pt-3 text-sm dark:border-slate-800">
            <span className="font-semibold text-slate-900 dark:text-white">
              Total paid
            </span>
            <span className="text-lg font-semibold text-slate-900 dark:text-white">
              ${totalPaid.toFixed(2)}
            </span>
          </div>
        </div>
      </div>
    );
  }

  /* ─── Expired (only before payment) ─── */
  if (expired && prePayment) {
    return (
      <div className="shipin-surface p-5">
        <div className="mb-3 flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-red-500/10">
            <AlertCircle size={18} className="text-red-400" />
          </div>
          <h2 className="text-base font-semibold text-slate-950 dark:text-white">
            Quote expired
          </h2>
        </div>

        <p className="text-sm text-slate-500">
          This quote can no longer be approved or paid. Request an updated
          quote and our team will review your order again.
        </p>

        {regenerationAlreadyRequested ? (
          <div className="mt-4 rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
            New quote already requested. You&apos;ll see it here when it&apos;s
            ready.
          </div>
        ) : (
          <button
            type="button"
            onClick={handleRequestNewQuote}
            disabled={requestingQuote}
            className="shipin-btn-primary mt-4 inline-flex w-full items-center justify-center gap-2 py-3 text-sm disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCw
              size={16}
              className={requestingQuote ? "animate-spin" : ""}
            />
            {requestingQuote ? "Requesting…" : "Request new quote"}
          </button>
        )}
      </div>
    );
  }

  /* ─── Quote ready — only if still valid ─── */
  if (request.status === "review") {
    return (
      <div className="shipin-surface p-5">
        <h2 className="text-base font-semibold text-slate-950 dark:text-white">
          Quote ready
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          Approve to continue to payment.
        </p>
        <button
          type="button"
          onClick={onApproveQuote}
          disabled={approving}
          className="shipin-btn-primary mt-4 w-full py-3 text-sm disabled:opacity-50"
        >
          {approving ? "Approving…" : "Approve quote"}
        </button>
      </div>
    );
  }

  /* ─── Payment required — only if still valid ─── */
  if (request.status === "awaiting_payment" && !request.payment) {
    return (
      <div className="shipin-surface p-5">
        <h2 className="text-base font-semibold text-slate-950 dark:text-white">
          Payment required
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          Your quote is approved. Complete payment to proceed.
        </p>
        <button
          type="button"
          onClick={() => router.push(`/payment/${request.id}`)}
          className="shipin-btn-primary mt-4 w-full py-3 text-sm"
        >
          Continue to payment
        </button>
      </div>
    );
  }

  return null;
}