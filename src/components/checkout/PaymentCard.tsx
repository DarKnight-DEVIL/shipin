"use client";

import { useState } from "react";
import {
  Wallet,
  PlusCircle,
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
        throw new Error(
          data.error ||
            "Unable to complete wallet payment."
        );
      }

      window.location.reload();
    } catch (err) {
      console.error(err);

      toast.error(
        "Unable to complete payment.",
        {
          description:
            "Please try again in a few moments.",
        }
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm dark:shadow-none hover:shadow-md transition-all duration-200">

      {/* ========================================
          HEADER
          ======================================== */}

      <div className="border-b border-slate-200 dark:border-slate-800 p-8">
        <h2 className="text-2xl font-bold">
          Payment Method
        </h2>

        <p className="mt-2 text-slate-400">
          Choose how you'd like to pay.
        </p>
      </div>

      <div className="space-y-6 p-8">

        {/* ========================================
            PAYMENT SUMMARY
            ======================================== */}

        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/40 p-8 space-y-4">

          {/* ShipIN quotation amount */}
          <Row
            title="ShipIN Quote Total"
            value={
              request.quote!.breakdown.grandTotal
            }
          />

          {/* PayPal processing fee */}
          {payment.processingFee > 0 && (
            <Row
              title="PayPal Processing Fee"
              value={payment.processingFee}
            />
          )}

          {/* Complete amount before wallet */}
          <div className="border-t border-slate-200 dark:border-slate-800 pt-4">
            <Row
              title="Total Payment"
              value={payment.grandTotal}
              bold
            />
          </div>

          {/* Wallet deduction */}
          {useWallet &&
            payment.walletApplied > 0 && (
              <Row
                title="Wallet Applied"
                value={
                  -payment.walletApplied
                }
                green
              />
            )}

          {/* PayPal amount */}
          {payment.paypalAmount > 0 && (
            <div className="border-t border-slate-200 dark:border-slate-800 pt-4">
              <Row
                title="Pay Now with PayPal"
                value={payment.paypalAmount}
                bold
              />
            </div>
          )}

          {/* Fully wallet-paid */}
          {payment.paypalAmount === 0 &&
            payment.walletApplied > 0 && (
              <div className="border-t border-slate-200 dark:border-slate-800 pt-4">
                <Row
                  title="Remaining PayPal Payment"
                  value={0}
                  bold
                />
              </div>
            )}

        </div>

        {/* ========================================
            WALLETS
            ======================================== */}

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

            {/* Wallet toggle */}

            <button
              type="button"
              onClick={() =>
                setUseWallet(
                  (current) => !current
                )
              }
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

          </div>
        )}

        {/* ========================================
            PAYPAL / WALLET-ONLY PAYMENT
            ======================================== */}

        {payment.paypalAmount === 0 ? (

          <button
            type="button"
            onClick={
              completeWalletPayment
            }
            className="w-full rounded-2xl bg-blue-600 text-white py-4 text-lg font-semibold transition hover:bg-blue-700 disabled:opacity-50"
            disabled={
              loading ||
              payment.walletApplied <= 0
            }
          >
            {loading
              ? "Processing..."
              : "Complete with Wallet"}
          </button>

        ) : (

          <div className="space-y-4">
            <PayPalCheckout
              requestId={request.id}
              amount={payment.paypalAmount}
              paymentType="main"
              onSuccess={() =>
                window.location.reload()
              }
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