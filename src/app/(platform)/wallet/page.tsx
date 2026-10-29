"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowDownToLine,
  ArrowUpRight,
  Plus,
  ReceiptText,
} from "lucide-react";

import { auth } from "@/lib/firebase";
import { getWallet, getWalletTransactions } from "@/lib/wallet";
import EmptyState from "@/components/ui/EmptyState";
import PageHeader from "@/components/ui/PageHeader";

interface WalletData {
  balance: number;
  currency: "USD";
}

interface WalletTransaction {
  id: string;
  type?: string;
  amount: number;
  balanceAfter?: number;
  description?: string;
  createdAt?: {
    toDate?: () => Date;
  };
}

function formatMoney(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(n);
}

function formatDate(date?: Date) {
  if (!date) return "";
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function txLabel(tx: WalletTransaction) {
  if (tx.description?.trim()) return tx.description;
  if (tx.type === "topup" || tx.type === "credit") return "Top up";
  if (tx.type === "payment" || tx.type === "debit") return "Payment";
  if (tx.type === "refund") return "Refund";
  return "Transaction";
}

export default function WalletPage() {
  const [wallet, setWallet] = useState<WalletData>({
    balance: 0,
    currency: "USD",
  });
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      if (!user) {
        if (mounted) {
          setWallet({ balance: 0, currency: "USD" });
          setTransactions([]);
          setLoading(false);
        }
        return;
      }

      try {
        const [data, history] = await Promise.all([
          getWallet(user.uid),
          getWalletTransactions(user.uid),
        ]);

        if (!mounted) return;

        setWallet({
          balance: Number(data.balance) || 0,
          currency: "USD",
        });
        setTransactions(history as WalletTransaction[]);
      } catch (error) {
        console.error("Failed to load wallet:", error);
      } finally {
        if (mounted) setLoading(false);
      }
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  if (loading) {
    return (
      <div className="app-page">
        <div className="mb-6 h-7 w-32 animate-pulse rounded bg-[var(--surface-3)]" />
        <div className="grid gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
          <div className="app-panel h-44 animate-pulse" />
          <div className="app-panel h-64 animate-pulse" />
        </div>
      </div>
    );
  }

  return (
    <div className="app-page">
      <PageHeader
        title="Wallet"
        subtitle="Balance and activity for ShipIN payments"
        actions={
          <Link href="/wallet/topup" className="app-btn app-btn-primary">
            <Plus size={15} strokeWidth={2.5} />
            Top up
          </Link>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[320px_minmax(0,1fr)] lg:items-start">
        {/* Balance */}
        <section>
          <div className="mb-2.5 flex items-baseline justify-between gap-3">
            <h2 className="app-section-title">Balance</h2>
          </div>

          <div className="dash-card p-5">
            <p className="app-kicker text-[var(--muted)]">
              Available balance
            </p>

            <p className="mt-2 text-[32px] font-semibold leading-none tracking-[-0.02em] tabular-nums text-[var(--foreground)]">
              {formatMoney(wallet.balance)}
            </p>

            <p className="mt-1.5 text-[11px] text-[var(--muted)]">
              USD · applied automatically at checkout
            </p>

            <div className="mt-4 border-t border-[var(--border)] pt-3.5">
              {wallet.balance <= 0 ? (
                <p className="text-[11px] leading-5 text-[var(--muted-soft)]">
                  Add funds with PayPal to pay for requests from your wallet.
                </p>
              ) : (
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-[var(--muted)]">Status</span>
                  <span className="text-[var(--foreground)]">Ready to use</span>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Activity */}
        <section>
          <div className="mb-2.5 flex items-baseline justify-between gap-3">
            <h2 className="app-section-title">Activity</h2>

            {transactions.length > 0 && (
              <span className="text-[11px] tabular-nums text-[var(--muted)]">
                {transactions.length}{" "}
                {transactions.length === 1 ? "entry" : "entries"}
              </span>
            )}
          </div>

          {transactions.length === 0 ? (
            <EmptyState
              icon={<ReceiptText size={18} />}
              title="No activity yet"
              description="Top-ups, payments and refunds will show up here. Add funds to pay for a request in one tap at checkout."
            />
          ) : (
            <div className="app-panel app-panel-flush">
              <div className="app-list">
                {transactions.map((tx) => {
                  const amount = Number(tx.amount) || 0;
                  const credit = amount >= 0;
                  const date = tx.createdAt?.toDate?.();

                  return (
                    <div
                      key={tx.id}
                      className="flex items-center justify-between gap-4 px-5 py-3.5"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--surface-2)] text-[var(--muted)]">
                          {credit ? (
                            <ArrowDownToLine size={13} strokeWidth={2.25} />
                          ) : (
                            <ArrowUpRight size={13} strokeWidth={2.25} />
                          )}
                        </span>

                        <div className="min-w-0">
                          <p className="truncate text-[12px] font-medium text-[var(--foreground)]">
                            {txLabel(tx)}
                          </p>
                          {date && (
                            <p className="mt-0.5 text-[11px] text-[var(--muted)]">
                              {formatDate(date)}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="shrink-0 text-right">
                        <p
                          className={`text-[12px] font-medium tabular-nums ${
                            credit
                              ? "text-emerald-600 dark:text-emerald-400"
                              : "text-[var(--foreground)]"
                          }`}
                        >
                          {credit ? "+" : "−"}
                          {formatMoney(Math.abs(amount))}
                        </p>

                        {typeof tx.balanceAfter === "number" && (
                          <p className="mt-0.5 text-[11px] tabular-nums text-[var(--muted-soft)]">
                            {formatMoney(tx.balanceAfter)}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
