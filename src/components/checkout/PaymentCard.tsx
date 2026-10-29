"use client";

import { useState } from "react";
import { Wallet } from "lucide-react";
import { toast } from "sonner";

import type { Request } from "@/types/request";
import dynamic from "next/dynamic";

/* PayPal injects its own markup after mount — keep it off the server
   render so React never hydrates against a different tree. */
const PayPalCheckout = dynamic(
  () => import("@/components/payment/PayPalCheckout"),
  { ssr: false }
);
import { calculatePayment } from "@/features/finance/calculatePayment";

interface Props {
  request: Request;
  walletBalance: number;
}

export default function PaymentCard({ request, walletBalance }: Props) {
  const [useWallet, setUseWallet] = useState(false);
  const [loading, setLoading] = useState(false);

  const payment = calculatePayment({
    breakdown: request.quote!.breakdown,
    walletBalance,
    useWallet,
  });

  const hasWallet = walletBalance > 0;

  async function completeWalletPayment() {
    try {
      setLoading(true);

      const response = await fetch("/api/payment/complete-wallet", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          requestId: request.id,
          amount: payment.walletApplied,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Unable to complete wallet payment.");
      }

      window.location.reload();
    } catch (err) {
      console.error(err);

      toast.error("Unable to complete payment.", {
        description: "Please try again in a few moments.",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="app-panel overflow-hidden">
      {/* ========================================
          HEADER
      ======================================== */}
      <div className="border-b border-[var(--border)] px-5 py-3.5">
        <h2 className="text-[13px] font-semibold text-[var(--foreground)]">
          Payment method
        </h2>
        <p className="mt-0.5 text-[12px] text-[var(--muted)]">
          Choose how you&apos;d like to pay.
        </p>
      </div>

      <div className="space-y-5 p-5">
        {/* ========================================
            PAYMENT SUMMARY
        ======================================== */}
        <div className="rounded-[14px] border border-[var(--border)] bg-[var(--surface-2)] p-4">
          <div className="space-y-3">
            <Row
              title="ShipIN quote total"
              value={request.quote!.breakdown.grandTotal}
            />

            {payment.processingFee > 0 && (
              <Row
                title="PayPal processing fee"
                value={payment.processingFee}
              />
            )}

            <div className="border-t border-[var(--border)] pt-3">
              <Row title="Total payment" value={payment.grandTotal} bold />
            </div>

            {useWallet && payment.walletApplied > 0 && (
              <Row title="Wallet applied" value={-payment.walletApplied} credit />
            )}

            {payment.paypalAmount > 0 && (
              <div className="border-t border-[var(--border)] pt-3">
                <Row
                  title="Pay now with PayPal"
                  value={payment.paypalAmount}
                  bold
                />
              </div>
            )}

            {payment.paypalAmount === 0 && payment.walletApplied > 0 && (
              <div className="border-t border-[var(--border)] pt-3">
                <Row
                  title="Remaining PayPal payment"
                  value={0}
                  bold
                />
              </div>
            )}
          </div>
        </div>

        {/* ========================================
            WALLETS
        ======================================== */}
        {hasWallet && (
          <div className="rounded-[14px] border border-[var(--border)] p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--surface-2)] text-[var(--muted)]">
                  <Wallet size={15} />
                </span>

                <div className="min-w-0">
                  <p className="text-[13px] font-medium text-[var(--foreground)]">
                    Apply wallet balance
                  </p>
                  <p className="text-[12px] text-[var(--muted)]">
                    Available balance
                  </p>
                </div>
              </div>

              <p className="shrink-0 text-[18px] font-semibold tabular-nums text-[var(--foreground)]">
                ${walletBalance.toFixed(2)}
              </p>
            </div>

            {/* Wallet toggle */}
            <button
              type="button"
              role="switch"
              aria-checked={useWallet}
              onClick={() => setUseWallet((current) => !current)}
              className="mt-4 flex w-full items-center justify-between rounded-[14px] border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3 transition hover:border-[var(--border-strong)]"
            >
              <span className="text-[13px] font-medium text-[var(--foreground)]">
                Use wallet for this payment
              </span>

              <span
                aria-hidden
                className={`relative h-[18px] w-8 shrink-0 rounded-full transition-colors ${
                  useWallet
                    ? "bg-[var(--accent-solid)]"
                    : "bg-[var(--surface-3)] ring-1 ring-inset ring-[var(--border)]"
                }`}
              >
                <span
                  className={`absolute top-[2px] h-[14px] w-[14px] rounded-full bg-white shadow-sm transition-transform ${
                    useWallet ? "translate-x-[16px]" : "translate-x-[2px]"
                  }`}
                />
              </span>
            </button>
          </div>
        )}

        {/* ========================================
            PAYPAL / WALLET-ONLY PAYMENT
        ======================================== */}
        {payment.paypalAmount === 0 ? (
          <button
            type="button"
            onClick={completeWalletPayment}
            className="app-btn app-btn-primary app-btn-lg app-btn-block"
            disabled={loading || payment.walletApplied <= 0}
          >
            {loading ? "Processing…" : "Complete with wallet"}
          </button>
        ) : (
          <div>
            <PayPalCheckout
              requestId={request.id}
              amount={payment.paypalAmount}
              paymentType="main"
              onSuccess={() => window.location.reload()}
            />
          </div>
        )}
      </div>
    </section>
  );
}

/*
 * ========================================
 * PAYMENT SUMMARY ROW
 * ========================================
 */

function Row({
  title,
  value,
  bold,
  credit,
}: {
  title: string;
  value: number;
  bold?: boolean;
  credit?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 text-[13px]">
      <span className={bold ? "font-medium text-[var(--foreground)]" : "text-[var(--muted)]"}>
        {title}
      </span>

      <span
        className={`tabular-nums ${
          bold ? "font-semibold text-[var(--foreground)]" : "font-medium"
        } ${
          credit ? "text-emerald-600 dark:text-emerald-400" : "text-[var(--foreground)]"
        }`}
      >
        {value < 0 ? "-" : ""}${Math.abs(value).toFixed(2)}
      </span>
    </div>
  );
}
