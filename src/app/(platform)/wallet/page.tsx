"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowDownToLine, ArrowUpRight, Plus, ReceiptText } from "lucide-react";

import { auth } from "@/lib/firebase";
import { getWallet, getWalletTransactions } from "@/lib/wallet";
import EmptyState from "@/components/ui/EmptyState";

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
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <div className="mb-8 h-7 w-32 animate-pulse rounded-lg bg-slate-200 dark:bg-slate-800" />
        <div className="mb-8 h-36 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800/60" />
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-16 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800/40"
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      {/* Header */}
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">
            Wallet
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Balance and activity for ShipIN payments
          </p>
        </div>

        <Link
          href="/wallet/topup"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-sm font-medium text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100"
        >
          <Plus size={16} strokeWidth={2.5} />
          Top up
        </Link>
      </div>

      {/* Balance */}
      <div className="mb-8 rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900 sm:p-7">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Available
        </p>
        <p className="mt-2 text-3xl font-semibold tracking-tight text-slate-900 dark:text-white sm:text-4xl">
          {formatMoney(wallet.balance)}
        </p>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          USD · used automatically at checkout when available
        </p>

        {wallet.balance <= 0 && (
          <div className="mt-5 flex flex-col gap-3 border-t border-slate-100 pt-5 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Add funds with PayPal to pay for requests from your wallet.
            </p>
            <Link
              href="/wallet/topup"
              className="inline-flex items-center gap-1.5 self-start rounded-lg border border-slate-200 px-3.5 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <ArrowDownToLine size={15} />
              Add funds
            </Link>
          </div>
        )}
      </div>

      {/* History */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-medium text-slate-900 dark:text-white">
            Activity
          </h2>
          {transactions.length > 0 && (
            <span className="text-xs text-slate-400">
              {transactions.length}{" "}
              {transactions.length === 1 ? "entry" : "entries"}
            </span>
          )}
        </div>

        {transactions.length === 0 ? (
          <EmptyState
            icon={<ReceiptText size={22} />}
            title="No activity yet"
            description="Top-ups, payments, and refunds will show up here."
            action={
              <Link
                href="/wallet/topup"
                className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100"
              >
                <Plus size={16} strokeWidth={2.5} />
                Top up wallet
              </Link>
            }
          />
        ) : (
          <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
            {transactions.map((tx) => {
              const amount = Number(tx.amount) || 0;
              const credit = amount >= 0;
              const date = tx.createdAt?.toDate?.();

              return (
                <li
                  key={tx.id}
                  className="flex items-start justify-between gap-4 px-4 py-3.5 sm:px-5"
                >
                  <div className="flex min-w-0 items-start gap-3">
                    <span
                      className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                        credit
                          ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400"
                          : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                      }`}
                    >
                      {credit ? (
                        <ArrowDownToLine size={14} strokeWidth={2.25} />
                      ) : (
                        <ArrowUpRight size={14} strokeWidth={2.25} />
                      )}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-900 dark:text-white">
                        {txLabel(tx)}
                      </p>
                      {date && (
                        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                          {formatDate(date)}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="shrink-0 text-right">
                    <p
                      className={`text-sm font-medium tabular-nums ${
                        credit
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-slate-900 dark:text-white"
                      }`}
                    >
                      {credit ? "+" : "−"}
                      {formatMoney(Math.abs(amount))}
                    </p>
                    {typeof tx.balanceAfter === "number" && (
                      <p className="mt-0.5 text-xs tabular-nums text-slate-400">
                        {formatMoney(tx.balanceAfter)}
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}