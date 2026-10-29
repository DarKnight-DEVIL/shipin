"use client";

import { useEffect, useState } from "react";
import { PayPalButtons } from "@paypal/react-paypal-js";
import { toast } from "sonner";

import { auth } from "@/lib/firebase";
import { getWallet } from "@/lib/wallet";
import PageHeader from "@/components/ui/PageHeader";

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
    <div className="app-page">
      <PageHeader
        backHref="/wallet"
        backLabel="Wallet"
        title="Top up"
        subtitle="Add funds securely with PayPal. They are available immediately."
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
        {/* Amount */}
        <section className="app-panel app-panel-flush">
          <div className="border-b border-[var(--border)] px-5 py-3.5">
            <h2 className="app-section-title">Amount</h2>
            <p className="mt-0.5 text-[12px] text-[var(--muted)]">
              Choose a preset or enter your own
            </p>
          </div>

          <div className="p-5">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {PRESET_AMOUNTS.map((value) => {
                const selected = amount === value;

                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setAmount(value)}
                    className={`h-11 rounded-lg border text-[13px] font-semibold tabular-nums transition-colors ${
                      selected
                        ? "border-[var(--accent-solid)] bg-[var(--accent-soft)] text-[var(--foreground)]"
                        : "border-[var(--border)] bg-[var(--card)] text-[var(--muted)] hover:border-[var(--border-strong)] hover:text-[var(--foreground)]"
                    }`}
                  >
                    ${value}
                  </button>
                );
              })}
            </div>

            <label
              htmlFor="wallet-amount"
              className="app-label mt-5 mb-1.5"
            >
              Custom amount
            </label>

            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[13px] text-[var(--muted-soft)]">
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
                className="app-input pl-7 text-[14px] tabular-nums"
              />
            </div>

            {!amountValid && (
              <div className="app-notice-danger mt-3 rounded-lg px-3.5 py-2.5 text-[12px] text-rose-800 dark:text-rose-200">
                Enter an amount between $1 and $10,000.
              </div>
            )}
          </div>
        </section>

        {/* Summary */}
        <aside className="lg:sticky lg:top-6">
          <div className="app-panel p-5">
            <h2 className="app-section-title">Summary</h2>

            <dl className="mt-3.5 space-y-2.5 text-[12px]">
              <div className="flex items-baseline justify-between gap-4">
                <dt className="text-[var(--muted)]">You will add</dt>
                <dd className="font-semibold tabular-nums text-[var(--foreground)]">
                  ${amount.toFixed(2)}
                </dd>
              </div>

              {currentBalance !== null && (
                <>
                  <div className="flex items-baseline justify-between gap-4">
                    <dt className="text-[var(--muted)]">Current balance</dt>
                    <dd className="tabular-nums text-[var(--foreground)]">
                      ${currentBalance.toFixed(2)}
                    </dd>
                  </div>

                  <div className="flex items-baseline justify-between gap-4 border-t border-[var(--border)] pt-2.5">
                    <dt className="text-[var(--muted)]">After top-up</dt>
                    <dd className="text-[15px] font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                      ${projectedBalance!.toFixed(2)}
                    </dd>
                  </div>
                </>
              )}
            </dl>

            {amountValid && (
              <div
                className={`mt-4 ${
                  processing ? "pointer-events-none opacity-60" : ""
                }`}
              >
                <PayPalButtons
                  style={{
                    layout: "vertical",
                    color: "gold",
                    shape: "rect",
                    label: "paypal",
                    height: 44,
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
            )}

            <p className="mt-3 text-[11px] leading-5 text-[var(--muted)]">
              Payments are processed by PayPal. ShipIN never stores your card
              details.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
