"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { PayPalButtons } from "@paypal/react-paypal-js";
import { ArrowLeft, WalletCards } from "lucide-react";
import { toast } from "sonner";

import { auth } from "@/lib/firebase";
import { getWallet } from "@/lib/wallet";

const PRESET_AMOUNTS = [25, 50, 100, 250];

export default function WalletTopupPage() {
  const [amount, setAmount] = useState(50);
  const [processing, setProcessing] = useState(false);
  const [currentBalance, setCurrentBalance] = useState<number | null>(null);

  useEffect(() => {
    let mounted = true;

    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      if (!user) {
        if (mounted) setCurrentBalance(null);
        return;
      }

      try {
        const data = await getWallet(user.uid);
        if (mounted) {
          setCurrentBalance(Number(data.balance) || 0);
        }
      } catch (error) {
        console.error("Failed to load wallet balance:", error);
        if (mounted) setCurrentBalance(null);
      }
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  function handleAmountChange(value: number) {
    if (!Number.isFinite(value)) {
      setAmount(0);
      return;
    }
    setAmount(Math.max(0, value));
  }

  async function getAuthToken() {
    const user = auth.currentUser;
    if (!user) {
      throw new Error("Please sign in before adding wallet funds.");
    }
    return user.getIdToken();
  }

  const amountValid = amount >= 1 && amount <= 10000;
  const projectedBalance =
    currentBalance !== null ? currentBalance + amount : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      className="shipin-page w-full px-6 py-8 lg:px-10"
    >
      <div className="mx-auto max-w-2xl">
        {/* Back */}
        <Link
          href="/wallet"
          className="mb-6 inline-flex items-center gap-2 text-sm text-slate-600 transition hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to wallet
        </Link>

        {/* Header */}
        <div className="mb-8 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400">
            <WalletCards size={22} />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-slate-950 dark:text-white">
              Top Up Wallet
            </h1>
            <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
              Add funds securely with PayPal
            </p>
          </div>
        </div>

        <div className="shipin-card p-6 md:p-8">
          <h2 className="mb-4 text-lg font-semibold text-slate-950 dark:text-white">
            Select amount
          </h2>

          <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {PRESET_AMOUNTS.map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setAmount(value)}
                className={`rounded-xl py-3.5 text-sm font-semibold transition ${
                  amount === value
                    ? "bg-purple-600 text-white shadow-md shadow-purple-600/25"
                    : "border border-slate-200 bg-slate-50 text-slate-700 hover:border-purple-300 hover:bg-purple-50 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-200 dark:hover:border-purple-500/40 dark:hover:bg-purple-500/10"
                }`}
              >
                ${value}
              </button>
            ))}
          </div>

          <label
            htmlFor="wallet-amount"
            className="mb-2 block text-sm font-medium text-slate-600 dark:text-slate-400"
          >
            Custom amount
          </label>

          <div className="relative mb-6">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
              $
            </span>
            <input
              id="wallet-amount"
              type="number"
              min={1}
              max={10000}
              step="0.01"
              value={amount || ""}
              onChange={(e) => handleAmountChange(Number(e.target.value))}
              className="w-full rounded-xl border border-slate-200 bg-white p-4 pl-9 text-slate-950 outline-none transition focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
            />
          </div>

          {amountValid ? (
            <>
              {/* Summary */}
              <div className="mb-6 space-y-3 rounded-xl border border-purple-500/20 bg-purple-500/10 px-5 py-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-600 dark:text-slate-400">
                    You will add
                  </span>
                  <span className="text-xl font-bold text-slate-950 dark:text-white">
                    ${amount.toFixed(2)}
                  </span>
                </div>

                {currentBalance !== null && (
                  <>
                    <div className="border-t border-purple-500/15" />
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-600 dark:text-slate-400">
                        Current balance
                      </span>
                      <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                        ${currentBalance.toFixed(2)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                        Total after top-up
                      </span>
                      <span className="text-lg font-bold text-emerald-500">
                        ${projectedBalance!.toFixed(2)}
                      </span>
                    </div>
                  </>
                )}
              </div>

              <div
                className={
                  processing ? "pointer-events-none opacity-60" : undefined
                }
              >
                <PayPalButtons
                  style={{
                    layout: "vertical",
                    color: "gold",
                    shape: "rect",
                    label: "paypal",
                    height: 48,
                    tagline: false,
                  }}
                  createOrder={async () => {
                    const token = await getAuthToken();
                    const response = await fetch(
                      "/api/paypal/create-wallet-topup",
                      {
                        method: "POST",
                        headers: {
                          "Content-Type": "application/json",
                          Authorization: `Bearer ${token}`,
                        },
                        body: JSON.stringify({ amount }),
                      }
                    );
                    const data = await response.json();
                    if (!response.ok || !data.success || !data.orderId) {
                      throw new Error(
                        data.error || "Could not create wallet top-up."
                      );
                    }
                    return data.orderId;
                  }}
                  onApprove={async (data) => {
                    try {
                      setProcessing(true);
                      const token = await getAuthToken();
                      const response = await fetch(
                        "/api/paypal/capture-wallet-topup",
                        {
                          method: "POST",
                          headers: {
                            "Content-Type": "application/json",
                            Authorization: `Bearer ${token}`,
                          },
                          body: JSON.stringify({
                            orderID: data.orderID,
                            amount,
                          }),
                        }
                      );
                      const result = await response.json();
                      if (!response.ok || !result.success) {
                        throw new Error(
                          result.error ||
                            "Wallet top-up could not be completed."
                        );
                      }
                      toast.success(
                        `$${Number(result.amount).toFixed(2)} added to your wallet.`
                      );
                      window.location.href = "/wallet";
                    } catch (error) {
                      console.error("Wallet top-up failed:", error);
                      toast.error(
                        error instanceof Error
                          ? error.message
                          : "Wallet top-up failed."
                      );
                      setProcessing(false);
                    }
                  }}
                  onError={(error) => {
                    console.error("PayPal wallet error:", error);
                    toast.error("PayPal payment failed. Please try again.");
                    setProcessing(false);
                  }}
                />
              </div>
            </>
          ) : (
            <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-600 dark:text-red-400">
              Enter an amount between $1 and $10,000.
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}