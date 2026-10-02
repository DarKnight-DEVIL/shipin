"use client";

import { useState } from "react";
import { PayPalButtons } from "@paypal/react-paypal-js";
import { toast } from "sonner";

import { auth } from "@/lib/firebase";

export default function WalletTopupPage() {
  const [amount, setAmount] =
    useState(50);

  const [processing, setProcessing] =
    useState(false);

  function handleAmountChange(
    value: number
  ) {
    if (!Number.isFinite(value)) {
      setAmount(0);
      return;
    }

    setAmount(
      Math.max(0, value)
    );
  }

  async function getAuthToken() {
    const user =
      auth.currentUser;

    if (!user) {
      throw new Error(
        "Please sign in before adding wallet funds."
      );
    }

    return user.getIdToken();
  }

  return (
    <div className="max-w-3xl">

      <h1 className="mb-8 text-4xl font-bold text-white">
        Top Up Wallet
      </h1>

      <div className="rounded-2xl border border-slate-800 bg-slate-900 p-8">

        <h2 className="mb-6 text-xl text-white">
          Select Amount
        </h2>

        <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-4">

          {[25, 50, 100, 250].map(
            (value) => (
              <button
                key={value}
                type="button"
                onClick={() =>
                  setAmount(value)
                }
                className={`rounded-xl py-4 font-semibold text-white transition ${
                  amount === value
                    ? "bg-purple-600 hover:bg-purple-700"
                    : "bg-slate-800 hover:bg-slate-700"
                }`}
              >
                ${value}
              </button>
            )
          )}

        </div>

        <label
          htmlFor="wallet-amount"
          className="mb-2 block text-sm font-medium text-slate-400"
        >
          Custom Amount
        </label>

        <div className="relative mb-8">

          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
            $
          </span>

          <input
            id="wallet-amount"
            type="number"
            min="1"
            max="10000"
            step="0.01"
            value={amount}
            onChange={(e) =>
              handleAmountChange(
                Number(e.target.value)
              )
            }
            className="w-full rounded-xl border border-slate-700 bg-slate-950 p-4 pl-9 text-white outline-none transition focus:border-purple-500"
          />

        </div>

        {amount > 0 &&
        amount <= 10000 ? (
          <>
            <div className="mb-6 rounded-xl border border-purple-500/20 bg-purple-500/10 p-5">

              <div className="flex items-center justify-between">

                <span className="text-slate-400">
                  Wallet Top Up
                </span>

                <span className="text-2xl font-bold text-white">
                  ${amount.toFixed(2)}
                </span>

              </div>

            </div>

            <div
              className={
                processing
                  ? "pointer-events-none opacity-60"
                  : ""
              }
            >

              <PayPalButtons
                style={{
                  layout: "vertical",
                  color: "gold",
                  shape: "rect",
                  label: "paypal",
                  height: 50,
                  tagline: false,
                }}

                createOrder={async () => {
                  const token =
                    await getAuthToken();

                  const response =
                    await fetch(
                      "/api/paypal/create-wallet-topup",
                      {
                        method: "POST",

                        headers: {
                          "Content-Type":
                            "application/json",

                          Authorization:
                            `Bearer ${token}`,
                        },

                        body: JSON.stringify({
                          amount,
                        }),
                      }
                    );

                  const data =
                    await response.json();

                  if (
                    !response.ok ||
                    !data.success ||
                    !data.orderId
                  ) {
                    throw new Error(
                      data.error ||
                        "Could not create wallet top-up."
                    );
                  }

                  return data.orderId;
                }}

                onApprove={async (
                  data
                ) => {
                  try {
                    setProcessing(
                      true
                    );

                    const token =
                      await getAuthToken();

                    const response =
                      await fetch(
                        "/api/paypal/capture-wallet-topup",
                        {
                          method: "POST",

                          headers: {
                            "Content-Type":
                              "application/json",

                            Authorization:
                              `Bearer ${token}`,
                          },

                          body:
                            JSON.stringify({
                              orderID:
                                data.orderID,

                              amount,
                            }),
                        }
                      );

                    const result =
                      await response.json();

                    if (
                      !response.ok ||
                      !result.success
                    ) {
                      throw new Error(
                        result.error ||
                          "Wallet top-up could not be completed."
                      );
                    }

                    toast.success(
                      `$${Number(
                        result.amount
                      ).toFixed(
                        2
                      )} added to your wallet.`
                    );

                    window.location.href =
                      "/wallet";
                  } catch (error) {
                    console.error(
                      "Wallet top-up failed:",
                      error
                    );

                    toast.error(
                      error instanceof Error
                        ? error.message
                        : "Wallet top-up failed."
                    );

                    setProcessing(
                      false
                    );
                  }
                }}

                onError={(error) => {
                  console.error(
                    "PayPal wallet error:",
                    error
                  );

                  toast.error(
                    "PayPal payment failed. Please try again."
                  );

                  setProcessing(
                    false
                  );
                }}
              />

            </div>
          </>
        ) : (
          <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-red-400">
            Enter an amount between $1 and $10,000.
          </div>
        )}

      </div>
    </div>
  );
}