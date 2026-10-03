"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowDownToLine,
  ReceiptText,
  WalletCards,
} from "lucide-react";

import { auth } from "@/lib/firebase";
import { getWallet, getWalletTransactions } from "@/lib/wallet";

import PageSkeleton from "@/components/ui/PageSkeleton";
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
        const data = await getWallet(user.uid);
        const history = await getWalletTransactions(user.uid);

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
    return <PageSkeleton />;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      className="shipin-page w-full px-6 py-8 lg:px-10"
    >
      {/* Header */}
      <div className="mb-8">
        <div className="mb-2 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400">
            <WalletCards size={23} />
          </div>
          <h1 className="text-3xl font-bold text-slate-950 dark:text-white md:text-4xl">
            Wallet
          </h1>
        </div>
        <p className="text-slate-500 dark:text-slate-400">
          Manage your ShipIN wallet balance and transactions.
        </p>
      </div>

      {/* Balance + CTA */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div className="shipin-card p-8">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
                Available Balance
              </p>
              <h2 className="mt-2 text-4xl font-bold text-emerald-500 md:text-5xl">
                ${wallet.balance.toFixed(2)}
              </h2>
              <p className="mt-2 text-sm text-slate-400">USD</p>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-500">
              <WalletCards size={24} />
            </div>
          </div>
        </div>

        <div className="shipin-card border-purple-500/20 bg-purple-500/5 p-8 dark:bg-purple-500/10">
          <h2 className="text-xl font-semibold text-slate-950 dark:text-white">
            Need more balance?
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
            Add funds securely using PayPal and use your wallet for future
            ShipIN payments.
          </p>
          <Link
            href="/wallet/topup"
            className="shipin-btn-primary mt-6 inline-flex items-center gap-2 px-5 py-3 text-sm"
          >
            <ArrowDownToLine size={18} />
            Top Up
          </Link>
        </div>
      </div>

      {/* Transactions */}
      <div className="shipin-card mt-8 p-6 md:p-8">
        <h2 className="mb-6 text-xl font-semibold text-slate-950 dark:text-white md:text-2xl">
          Transaction History
        </h2>

        {transactions.length === 0 ? (
          <EmptyState
            icon={<ReceiptText size={26} />}
            title="No transactions yet"
            description="Your wallet transactions will appear here once you add funds or use your wallet."
          />
        ) : (
          <div className="space-y-1">
            {transactions.map((tx, i) => {
              const isPositive = Number(tx.amount) >= 0;
              const date = tx.createdAt?.toDate?.();

              return (
                <div
                  key={tx.id}
                  className="flex flex-col gap-3 rounded-xl px-3 py-4 transition hover:bg-slate-50 dark:hover:bg-slate-800/50 sm:flex-row sm:items-center sm:justify-between"
                  style={{
                    animationDelay: `${Math.min(i, 8) * 0.04}s`,
                  }}
                >
                  <div className="min-w-0">
                    <p className="font-medium text-slate-900 dark:text-white">
                      {tx.description || "Wallet Transaction"}
                    </p>
                    {date && (
                      <p className="mt-1 text-sm text-slate-500">
                        {date.toLocaleString()}
                      </p>
                    )}
                  </div>

                  <div className="shrink-0 text-left sm:text-right">
                    <p
                      className={`font-bold ${
                        isPositive ? "text-emerald-500" : "text-red-500"
                      }`}
                    >
                      {isPositive ? "+" : "−"}$
                      {Math.abs(Number(tx.amount)).toFixed(2)}
                    </p>
                    {typeof tx.balanceAfter === "number" && (
                      <p className="mt-1 text-xs text-slate-500">
                        Balance: ${tx.balanceAfter.toFixed(2)}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </motion.div>
  );
}