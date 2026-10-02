"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowDownToLine, Plus, ReceiptText, WalletCards } from "lucide-react";

import { auth } from "@/lib/firebase";
import {
  getWallet,
  getWalletTransactions,
} from "@/lib/wallet";

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
  const [wallet, setWallet] =
    useState<WalletData>({
      balance: 0,
      currency: "USD",
    });

  const [transactions, setTransactions] =
    useState<WalletTransaction[]>([]);

  const [loading, setLoading] =
    useState(true);

  useEffect(() => {
    let mounted = true;

    const unsubscribe =
      auth.onAuthStateChanged(
        async (user) => {
          if (!user) {
            if (mounted) {
              setWallet({
                balance: 0,
                currency: "USD",
              });

              setTransactions([]);
              setLoading(false);
            }

            return;
          }

          try {
            const data =
              await getWallet(user.uid);

            const history =
              await getWalletTransactions(
                user.uid
              );

            if (!mounted) {
              return;
            }

            setWallet({
              balance:
                Number(data.balance) || 0,
              currency:
                data.currency === "USD"
                  ? "USD"
                  : "USD",
            });

            setTransactions(
              history as WalletTransaction[]
            );
          } catch (error) {
            console.error(
              "Failed to load wallet:",
              error
            );
          } finally {
            if (mounted) {
              setLoading(false);
            }
          }
        }
      );

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  if (loading) {
    return (
      <PageSkeleton />
    );
  }

  return (
    <div className="min-h-screen p-6 md:p-10">

      {/* Header */}
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">

        <div>
          <div className="mb-2 flex items-center gap-3">

            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400">
              <WalletCards size={23} />
            </div>

            <h1 className="text-4xl font-bold text-slate-950 dark:text-white">
              Wallet
            </h1>

          </div>

          <p className="text-slate-500 dark:text-slate-400">
            Manage your ShipIN wallet balance and
            transactions.
          </p>
        </div>

        <Link
          href="/wallet/topup"
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-purple-600 px-5 py-3 font-semibold text-white transition hover:bg-purple-700"
        >
          <Plus size={19} />
          Add Funds
        </Link>

      </div>

      {/* Balance */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">

        <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:shadow-none">

          <div className="flex items-start justify-between">

            <div>
              <p className="text-lg text-slate-500 dark:text-slate-400">
                Available Balance
              </p>

              <h2 className="mt-2 text-5xl font-bold text-green-500">
                ${wallet.balance.toFixed(2)}
              </h2>

              <p className="mt-2 text-sm text-slate-400">
                USD
              </p>
            </div>

            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-green-500/10 text-green-500">
              <WalletCards size={24} />
            </div>

          </div>

        </div>

        {/* Add Funds Card */}
        <div className="rounded-2xl border border-purple-500/20 bg-purple-500/5 p-8 dark:bg-purple-500/10">

          <h2 className="text-xl font-semibold text-slate-950 dark:text-white">
            Need more balance?
          </h2>

          <p className="mt-2 text-slate-500 dark:text-slate-400">
            Add funds securely using PayPal and use
            your wallet for future ShipIN payments.
          </p>

          <Link
            href="/wallet/topup"
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-purple-600 px-5 py-3 font-semibold text-white transition hover:bg-purple-700"
          >
            <ArrowDownToLine size={19} />
            Top Up Wallet
          </Link>

        </div>

      </div>

      {/* Transactions */}
      <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-8 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:shadow-none">

        <h2 className="mb-6 text-2xl font-semibold text-slate-950 dark:text-white">
          Recent Transactions
        </h2>

        {transactions.length === 0 ? (
          <EmptyState
            icon={
              <ReceiptText size={26} />
            }
            title="No transactions yet"
            description="Your wallet transactions will appear here once you add funds or use your wallet."
          />
        ) : (
          <div className="space-y-4">

            {transactions.map(
              (tx) => {
                const isPositive =
                  Number(tx.amount) >= 0;

                const date =
                  tx.createdAt?.toDate?.();

                return (
                  <div
                    key={tx.id}
                    className="flex flex-col gap-3 border-b border-slate-200 pb-4 last:border-0 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between"
                  >

                    <div className="min-w-0">

                      <p className="font-medium text-slate-900 dark:text-white">
                        {tx.description ||
                          "Wallet Transaction"}
                      </p>

                      {date && (
                        <p className="mt-1 text-sm text-slate-500 dark:text-slate-500">
                          {date.toLocaleString()}
                        </p>
                      )}

                    </div>

                    <div className="shrink-0 text-right">

                      <p
                        className={`font-bold ${
                          isPositive
                            ? "text-green-500"
                            : "text-red-500"
                        }`}
                      >
                        {isPositive
                          ? "+"
                          : "-"}
                        $
                        {Math.abs(
                          Number(
                            tx.amount
                          )
                        ).toFixed(2)}
                      </p>

                      {typeof tx.balanceAfter ===
                        "number" && (
                        <p className="mt-1 text-xs text-slate-500">
                          Balance: $
                          {tx.balanceAfter.toFixed(
                            2
                          )}
                        </p>
                      )}

                    </div>

                  </div>
                );
              }
            )}

          </div>
        )}

      </div>

    </div>
  );
}