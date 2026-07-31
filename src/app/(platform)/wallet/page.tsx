"use client";

import { useEffect, useState } from "react";
import { auth } from "@/lib/firebase";
import {
  getWallet,
  getWalletTransactions,
} from "@/lib/wallet";

interface WalletData {
  balance: number;
  currency: "USD";
}

export default function WalletPage() {
  const [wallet, setWallet] = useState<WalletData>({
    balance: 0,
    currency: "USD",
  });

  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      if (!user) {
        setLoading(false);
        return;
      }

      const data = await getWallet(user.uid);

      setWallet({
        balance: data.balance,
        currency: data.currency,
      });

      const history = await getWalletTransactions(user.uid);
      setTransactions(history);

      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="p-8 text-white">
        Loading wallet...
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto p-8">

      <h1 className="text-4xl font-bold text-white mb-8">
        Wallet
      </h1>

      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8">

        <p className="text-slate-400 text-lg">
          Available Balance
        </p>

        <h2 className="text-5xl font-bold text-green-400 mt-2">
          ${wallet.balance.toFixed(2)}
        </h2>

      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 mt-8">

        <h2 className="text-2xl font-semibold text-white mb-6">
          Recent Transactions
        </h2>

        {transactions.length === 0 ? (
          <p className="text-slate-500">
            No transactions yet.
          </p>
        ) : (
          <div className="space-y-4">

            {transactions.map((tx) => (

              <div
                key={tx.id}
                className="flex justify-between items-center border-b border-slate-800 pb-4"
              >

                <div>

                  <p className="text-white font-medium">
                    {tx.description}
                  </p>

                  <p className="text-sm text-slate-500">
                    {tx.createdAt
                      ?.toDate()
                      ?.toLocaleString()}
                  </p>

                </div>

                <div
                  className={`font-bold ${
                    tx.amount >= 0
                      ? "text-green-400"
                      : "text-red-400"
                  }`}
                >
                  {tx.amount >= 0 ? "+" : ""}
                  ${Math.abs(tx.amount).toFixed(2)}
                </div>

              </div>

            ))}

          </div>
        )}

      </div>

    </div>
  );
}