"use client";

import { useState } from "react";
import {
  Wallet,
  CreditCard,
  PlusCircle,
  ShieldCheck,
  Lock,
} from "lucide-react";
import { toast } from "sonner";

import type { Request } from "@/types/request";
import PayPalCheckout from "@/components/payment/PayPalCheckout";
import { calculatePayment } from "@/features/finance/calculatePayment";

interface Props {
  request: Request;
  walletBalance: number;
}

export default function PaymentCard({
  request,
  walletBalance,
}: Props) {
  // 1. Default useWallet to false
  const [useWallet, setUseWallet] = useState(false);
  const [loading, setLoading] = useState(false);

  const payment = calculatePayment({
    breakdown: request.quote!.breakdown,
    walletBalance,
    useWallet,
  });

  // 2. Add hasWallet check
  const hasWallet = walletBalance > 0;

  async function completeWalletPayment() {
    try {
      setLoading(true);

      const response = await fetch(
        "/api/payment/complete-wallet",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            requestId: request.id,
            amount: payment.walletApplied,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error);
      }

      window.location.reload();
    } catch (err) {
      console.error(err);
      toast.error("Unable to complete payment.", {
        description:
          "Please try again in a few moments.",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm dark:shadow-none hover:shadow-md transition-all duration-200">
      {/* Header */}
      <div className="border-b border-slate-200 dark:border-slate-800 p-8">
        <h2 className="text-2xl font-bold">
          Payment Method
        </h2>
        <p className="mt-2 text-slate-400">
          Choose how you'd like to pay.
        </p>
      </div>

      <div className="space-y-6 p-8">
        {/* 3. Summary moved to top */}
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/40 p-8 space-y-4">
          <Row
            title="Amount Before Wallet"
            value={payment.grandTotal}
          />

          {/* Show Wallet Applied only if enabled and > 0 */}
          {useWallet && payment.walletApplied > 0 && (
            <Row
              title="Wallet Applied"
              value={-payment.walletApplied}
              green
            />
          )}

          <div className="border-t border-slate-200 dark:border-slate-800 pt-4">
            <Row
              title="Pay Now"
              value={payment.paypalAmount}
              bold
            />
          </div>
        </div>

        {/* 4. Wallet - Show only if customer has balance */}
        {hasWallet && (
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-blue-50/50 dark:bg-slate-950/40 p-8">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Wallet
                  className="text-blue-600 dark:text-blue-400"
                  size={22}
                />
                <div>
                  <p className="font-semibold">
                    Apply Wallet Balance
                  </p>
                  <p className="text-sm text-slate-400">
                    Available Balance
                  </p>
                </div>
              </div>

              <p className="text-3xl font-bold text-blue-600 dark:text-blue-400">
                ${walletBalance.toFixed(2)}
              </p>
            </div>

            {/* iOS-style Toggle Switch */}
            <button
              onClick={() => setUseWallet(!useWallet)}
              className={`mt-5 flex w-full items-center justify-between rounded-xl border px-5 py-4 transition ${
                useWallet
                  ? "border-blue-500 bg-blue-600/10"
                  : "border-slate-200 dark:border-slate-700 bg-white dark:bg-transparent"
              }`}
            >
              <span className="font-medium">
                Use Wallet
              </span>

              <div
                className={`h-6 w-11 rounded-full transition ${
                  useWallet
                    ? "bg-blue-500"
                    : "bg-slate-300 dark:bg-slate-700"
                }`}
              >
                <div
                  className={`m-1 h-4 w-4 rounded-full bg-white transition ${
                    useWallet
                      ? "translate-x-5"
                      : ""
                  }`}
                />
              </div>
            </button>

            {/* Top Up button when balance <= 0 */}
            {walletBalance <= 0 && (
              <button
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-blue-500 py-3 text-blue-600 dark:text-blue-400 hover:bg-blue-500/10"
              >
                <PlusCircle size={18} />
                Add Funds to Wallet
              </button>
            )}
          </div>
        )}

        {/* Wallet Only vs PayPal Checkout */}
        {payment.paypalAmount === 0 ? (
          <button
            onClick={completeWalletPayment}
            className="w-full rounded-2xl bg-blue-600 text-white py-4 text-lg font-semibold transition hover:bg-blue-700 disabled:opacity-50"
            disabled={loading}
          >
            {loading ? "Processing..." : "Complete with Wallet"}
          </button>
        ) : (
          <div className="space-y-4">
            <div className="rounded-2xl border border-green-200 dark:border-green-900/40 bg-green-500/10 p-4">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5 text-green-700 dark:text-green-300">
                  <ShieldCheck size={20} />
                  <Lock size={16} />
                  <CreditCard size={18} />
                </div>

                <div>
                  <p className="font-semibold text-green-900 dark:text-green-100">
                    🔒 Secure Checkout
                  </p>
                  <p className="text-sm font-medium text-green-700 dark:text-green-300">
                    Protected by PayPal
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Buyer Protection Included
                  </p>
                </div>
              </div>
            </div>

            <PayPalCheckout
              requestId={request.id}
              amount={payment.paypalAmount}
              onSuccess={() => window.location.reload()}
            />
          </div>
        )}
      </div>
    </section>
  );
}

function Row({
  title,
  value,
  bold,
  green,
}: {
  title: string;
  value: number;
  bold?: boolean;
  green?: boolean;
}) {
  return (
    <div className="flex justify-between items-center">
      <span
        className={
          bold
            ? "font-semibold text-slate-900 dark:text-white"
            : "text-slate-600 dark:text-slate-400"
        }
      >
        {title}
      </span>

      <span
        className={`${
          bold
            ? "text-xl font-bold text-slate-900 dark:text-white"
            : "font-medium"
        } ${
          green
            ? "text-green-600 dark:text-green-400"
            : "text-slate-900 dark:text-white"
        }`}
      >
        {value < 0 ? "-" : ""}$
        {Math.abs(value).toFixed(2)}
      </span>
    </div>
  );
}