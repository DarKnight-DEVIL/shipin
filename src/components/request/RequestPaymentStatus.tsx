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

  if (!request.quote) {
    return null;
  }

  const paid = Boolean(request.payment);
  const expired = isQuoteExpired(request.quote.expiresAt);

  /*
   * Pre-payment statuses where the customer can still act on the quote.
   * Once paid (or status moves past payment), expiry is irrelevant.
   */
  const prePaymentStatus =
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

  /*
   * ========================================
   * ALREADY PAID — never show expire / pay UI
   * ========================================
   */
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
      <Card>
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-green-500/10">
            <CheckCircle2 size={22} className="text-green-500" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-slate-950 dark:text-white">
              Payment Received
            </h2>
            <p className="text-sm text-green-600 dark:text-green-400">
              Payment completed successfully
            </p>
          </div>
        </div>

        <p className="mb-6 text-slate-600 dark:text-slate-400">
          We&apos;ve received your payment. Our purchasing team will begin
          ordering your products shortly.
        </p>

        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 dark:border-slate-800 dark:bg-slate-950/40">
          <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Payment Details
          </h3>

          <div className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <span className="text-sm text-slate-600 dark:text-slate-400">
                Payment Method
              </span>
              <div className="flex items-center gap-2 font-semibold text-slate-900 dark:text-white">
                {paymentMethod === "wallet" && (
                  <Wallet size={17} className="text-blue-500" />
                )}
                {(paymentMethod === "paypal" ||
                  paymentMethod === "wallet_and_paypal" ||
                  paymentMethod === "paypal_and_wallet") && (
                  <CreditCard size={17} className="text-purple-500" />
                )}
                <span>{paymentMethodLabel}</span>
              </div>
            </div>

            {walletAmount > 0 && (
              <div className="flex items-center justify-between gap-4">
                <span className="text-sm text-slate-600 dark:text-slate-400">
                  Wallet Used
                </span>
                <span className="font-semibold text-blue-600 dark:text-blue-400">
                  -${walletAmount.toFixed(2)}
                </span>
              </div>
            )}

            {paypalAmount > 0 && (
              <div className="flex items-center justify-between gap-4">
                <span className="text-sm text-slate-600 dark:text-slate-400">
                  PayPal Paid
                </span>
                <span className="font-semibold text-slate-900 dark:text-white">
                  ${paypalAmount.toFixed(2)}
                </span>
              </div>
            )}

            <div className="border-t border-slate-200 pt-4 dark:border-slate-800">
              <div className="flex items-center justify-between gap-4">
                <span className="font-semibold text-slate-900 dark:text-white">
                  Total Paid
                </span>
                <span className="text-xl font-bold text-slate-900 dark:text-white">
                  ${totalPaid.toFixed(2)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </Card>
    );
  }

  /*
   * ========================================
   * QUOTE EXPIRED (only before payment)
   * ========================================
   */
  if (expired && prePaymentStatus) {
    return (
      <Card>
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-red-500/10">
            <AlertCircle size={20} className="text-red-500" />
          </div>
          <h2 className="text-xl font-semibold text-slate-950 dark:text-white">
            Quote Expired
          </h2>
        </div>

        <p className="mb-2 text-slate-600 dark:text-slate-400">
          This quote has expired and can no longer be approved or paid.
        </p>
        
        <p className="mb-6 text-sm text-slate-500 dark:text-slate-500">
          Request an updated quote and our team will review your order again.
        </p>

        {regenerationAlreadyRequested ? (
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
            New quote already requested. We&apos;re preparing an updated quote —
            you&apos;ll see it here when it&apos;s ready.
          </div>
        ) : (
          <button
            type="button"
            onClick={handleRequestNewQuote}
            disabled={requestingQuote}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-purple-600 py-3 font-semibold text-white transition hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCw
              size={18}
              className={requestingQuote ? "animate-spin" : ""}
            />
            {requestingQuote ? "Requesting..." : "Request new quote"}
          </button>
        )}
      </Card>
    );
  }

  /*
   * ========================================
   * QUOTE READY — approve (valid only)
   * ========================================
   */
  if (request.status === "review") {
    return (
      <Card>
        <h2 className="mb-2 text-xl font-semibold text-slate-950 dark:text-white">
          Quote Ready
        </h2>

        <p className="mb-6 text-slate-600 dark:text-slate-400">
          Your quotation is ready. Approve it to continue to payment.
        </p>

        <button
          type="button"
          onClick={onApproveQuote}
          disabled={approving || expired}
          className="w-full rounded-xl bg-green-600 py-3 font-semibold text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {approving ? "Approving..." : "Approve Quote"}
        </button>
      </Card>
    );
  }

  /*
   * ========================================
   * PAYMENT REQUIRED — pay (valid only)
   * ========================================
   */
  if (request.status === "awaiting_payment" && !request.payment) {
    return (
      <Card>
        <h2 className="mb-2 text-xl font-semibold text-slate-950 dark:text-white">
          Payment Required
        </h2>

        <p className="mb-6 text-slate-600 dark:text-slate-400">
          Your purchase invoice has been approved. Continue to complete your
          payment.
        </p>

        <button
          type="button"
          onClick={() => router.push(`/payment/${request.id}`)}
          disabled={expired}
          className="w-full rounded-xl bg-purple-600 py-3 font-semibold text-white hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Continue to Payment
        </button>
      </Card>
    );
  }

  return null;
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:shadow-none">
      {children}
    </div>
  );
}