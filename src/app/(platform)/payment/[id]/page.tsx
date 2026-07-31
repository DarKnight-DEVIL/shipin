"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { doc, updateDoc } from "firebase/firestore";
import { PayPalButtons } from "@paypal/react-paypal-js";

import { db } from "@/lib/firebase";
import { getRequestById } from "@/lib/firestore";
import type { Request } from "@/types/request";

import { auth } from "@/lib/firebase";
import { getWallet, deductFromWallet } from "@/lib/wallet";

function getTimestampMs(value: any): number | null {
  if (!value) {
    return null;
  }

  // Firestore Timestamp
  if (typeof value.toDate === "function") {
    return value.toDate().getTime();
  }

  // JavaScript Date
  if (value instanceof Date) {
    return value.getTime();
  }

  // ISO date string / numeric timestamp
  if (typeof value === "string" || typeof value === "number") {
    const time = new Date(value).getTime();

    return Number.isNaN(time) ? null : time;
  }

  // Serialized Firestore Timestamp
  if (typeof value === "object" && typeof value.seconds === "number") {
    return (
      value.seconds * 1000 + Math.floor((value.nanoseconds ?? 0) / 1_000_000)
    );
  }

  return null;
}

export default function PaymentPage() {
  const params = useParams();
  const router = useRouter();

  const requestId = params.id as string;

  const [request, setRequest] = useState<Request | null>(null);
  const [loading, setLoading] = useState(true);
  const [showPaypal, setShowPaypal] = useState(false);

  const [walletBalance, setWalletBalance] = useState(0);
  const [payingWithWallet, setPayingWithWallet] = useState(false);

  // Expiration check state
  const [quoteExpired, setQuoteExpired] = useState(false);

  useEffect(() => {
    if (!requestId) return;

    const loadRequest = async () => {
      try {
        const data = await getRequestById(requestId);
        if (data) {
          setRequest(data);

          const user = auth.currentUser;
          if (user) {
            const wallet = await getWallet(user.uid);
            setWalletBalance(wallet.balance);
          }

          if (data.status === "awaiting_payment") {
            setShowPaypal(false);
          }

          if (data.status === "paid") {
            setShowPaypal(true);
          }

          // Initial check for quote expiration
          if (data.quote?.expiresAt) {
            const expiryTime = getTimestampMs(data.quote.expiresAt);

            if (expiryTime !== null) {
              setQuoteExpired(Date.now() >= expiryTime);
            }
          }
        }
      } catch (error) {
        console.error(error);
      }

      setLoading(false);
    };

    loadRequest();
  }, [requestId]);

  // Handle active countdown for expiration if needed
  useEffect(() => {
    if (!request?.quote?.expiresAt || quoteExpired) return;

    const expiryTime = getTimestampMs(request.quote.expiresAt);

    if (expiryTime === null) {
      return;
    }

    const interval = setInterval(() => {
      if (Date.now() >= expiryTime) {
        setQuoteExpired(true);
        clearInterval(interval);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [request, quoteExpired]);

  if (loading) {
    return (
      <div className="p-8 max-w-4xl mx-auto">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 animate-pulse">
          <div className="h-9 w-32 bg-slate-800 rounded mb-2" />
          <div className="h-5 w-40 bg-slate-800 rounded mb-8" />

          <div className="space-y-4 mb-10">
            <div className="h-5 bg-slate-800 rounded" />
            <div className="h-5 bg-slate-800 rounded" />
            <div className="h-5 bg-slate-800 rounded" />
            <div className="h-5 bg-slate-800 rounded" />
            <div className="h-5 bg-slate-800 rounded" />
            <div className="border-t border-slate-800 pt-4">
              <div className="h-9 bg-slate-800 rounded" />
            </div>
          </div>

          <div className="h-14 bg-slate-800 rounded-xl" />
        </div>
      </div>
    );
  }

  if (!request) {
    return (
      <div className="p-8 max-w-4xl mx-auto">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8">
          <p className="text-white">Request not found.</p>
        </div>
      </div>
    );
  }

  const showAcceptQuote = request.status === "review" && !quoteExpired;
  const showCompletePayment =
    request.status === "awaiting_payment" && !showPaypal && !quoteExpired;

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8">
        <h1 className="text-4xl font-bold text-white mb-2">Payment</h1>

        <p className="text-slate-400 mb-8">
          Request #{request.id.slice(0, 6)}
        </p>

        <div className="space-y-4 mb-10">
          <div className="flex justify-between text-slate-300">
            <span>Status</span>
            <span className="capitalize">
              {request.status.replace(/_/g, " ")}
            </span>
          </div>

          <div className="flex justify-between text-slate-300">
            <span>Products Total</span>
            <span>
              $
              {request.quote?.breakdown?.productsTotal?.toFixed(2) || "0.00"}
            </span>
          </div>

          <div className="flex justify-between text-slate-300">
            <span>Domestic Shipping</span>
            <span>
              $
              {request.quote?.breakdown?.domesticShipping?.toFixed(2) ||
                "0.00"}
            </span>
          </div>

          <div className="flex justify-between text-slate-300">
            <span>International Shipping</span>
            <span>
              $
              {request.quote?.breakdown?.internationalShipping?.toFixed(2) ||
                "0.00"}
            </span>
          </div>

          <div className="flex justify-between text-slate-300">
            <span>ShipIN Fee</span>
            <span>
              ${request.quote?.breakdown?.serviceFee?.toFixed(2) || "0.00"}
            </span>
          </div>

          <div className="border-t border-slate-800 pt-4">
            <div className="flex justify-between text-3xl font-bold text-green-400">
              <span>Grand Total</span>
              <span>
                ${request.quote?.breakdown?.grandTotal?.toFixed(2) || "0.00"}
              </span>
            </div>
          </div>

          <div className="border-t border-slate-800 pt-4 mt-4">
            <div className="flex justify-between text-cyan-400 text-xl font-semibold">
              <span>Wallet Balance</span>
              <span>${walletBalance.toFixed(2)}</span>
            </div>
          </div>
        </div>

        <div className="flex flex-col">
          {quoteExpired && (
            <div className="mt-6 bg-red-500/10 border border-red-500/20 rounded-xl p-6">
              <h2 className="text-red-400 font-bold text-xl">
                Quote Expired
              </h2>

              <p className="text-slate-400 mt-3">
                This quote is no longer valid.
              </p>

              <button
                onClick={async () => {
                  const requestRef = doc(db, "requests", requestId);

                  await updateDoc(requestRef, {
                    "quote.regenerationRequested": true,
                  });

                  alert("A new quote has been requested.");

                  router.push(`/requests/${requestId}`);
                }}
                className="mt-6 bg-purple-600 hover:bg-purple-700 px-6 py-3 rounded-xl w-fit font-semibold text-white"
              >
                Request New Quote
              </button>
            </div>
          )}

          {(showAcceptQuote || showCompletePayment) && (
            <button
              onClick={async () => {
                if (showAcceptQuote) {
                  const requestRef = doc(db, "requests", requestId);

                  await updateDoc(requestRef, {
                    status: "awaiting_payment",
                  });

                  setRequest((prev) =>
                    prev
                      ? {
                          ...prev,
                          status: "awaiting_payment",
                        }
                      : prev
                  );
                } else {
                  setShowPaypal(true);
                }
              }}
              className={`w-full py-4 rounded-xl font-semibold text-lg ${
                showAcceptQuote
                  ? "bg-green-600 hover:bg-green-700 text-white"
                  : "bg-purple-600 hover:bg-purple-700 text-white"
              }`}
            >
              {showAcceptQuote ? "Accept Quote" : "Complete Payment"}
            </button>
          )}

          {request.status === "awaiting_payment" &&
            walletBalance >=
              (request.quote?.breakdown?.grandTotal ?? 0) &&
            !showPaypal &&
            !quoteExpired && (
              <button
                disabled={payingWithWallet}
                onClick={async () => {
                  try {
                    setPayingWithWallet(true);

                    const user = auth.currentUser;

                    if (!user) {
                      alert("Please log in again.");
                      return;
                    }

                    await deductFromWallet(
                      user.uid,
                      request.quote?.breakdown?.grandTotal ?? 0,
                      request.id
                    );

                    const requestRef = doc(db, "requests", request.id);

                    await updateDoc(requestRef, {
                      status: "paid",
                    });

                    setRequest({
                      ...request,
                      status: "paid",
                    });

                    setWalletBalance(
                      (prev) =>
                        prev - (request.quote?.breakdown?.grandTotal ?? 0)
                    );

                    alert("Payment completed using wallet.");
                  } catch (err) {
                    console.error(err);
                    alert(
                      err instanceof Error
                        ? err.message
                        : "Wallet payment failed."
                    );
                  } finally {
                    setPayingWithWallet(false);
                  }
                }}
                className="mt-6 w-full bg-emerald-600 hover:bg-emerald-700 rounded-xl py-4 font-semibold text-white"
              >
                {payingWithWallet ? "Processing..." : "Pay with Wallet"}
              </button>
            )}

          {showPaypal && request.status !== "paid" && !quoteExpired && (
            <div className="mt-6 w-full">
              <PayPalButtons
                fundingSource="paypal"
                style={{
                  layout: "vertical",
                  color: "gold",
                  shape: "rect",
                  label: "paypal",
                  height: 50,
                  tagline: false,
                }}
                createOrder={async () => {
                  const response = await fetch("/api/paypal/create-order", {
                    method: "POST",
                    headers: {
                      "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                      requestId: request.id,
                    }),
                  });

                  const data = await response.json();

                  if (!response.ok || !data.success || !data.orderId) {
                    console.error("Create order failed:", data);
                    throw new Error(
                      data.error || "Could not start PayPal checkout."
                    );
                  }

                  return data.orderId;
                }}
                onApprove={async (data) => {
                  try {
                    const response = await fetch("/api/paypal/capture-order", {
                      method: "POST",
                      headers: {
                        "Content-Type": "application/json",
                      },
                      body: JSON.stringify({
                        requestId: request.id,
                        orderID: data.orderID,
                      }),
                    });

                    const captureData = await response.json();

                    if (!response.ok || !captureData.success) {
                      console.error("Capture failed:", captureData);
                      throw new Error(
                        captureData.error || "Payment could not be completed."
                      );
                    }

                    if (
                      captureData.success &&
                      captureData.paymentType === "main"
                    ) {
                      setRequest((prev) =>
                        prev
                          ? {
                              ...prev,
                              status: "paid",
                            }
                          : prev
                      );

                      setShowPaypal(false);

                      alert("Payment successful!");

                      return;
                    }

                    throw new Error(
                      "Payment confirmation could not be verified."
                    );
                  } catch (error) {
                    console.error("PayPal capture error:", error);
                    alert(
                      error instanceof Error ? error.message : "Payment failed."
                    );
                  }
                }}
                onError={(err) => {
                  console.error(err);
                  alert("PayPal payment failed.");
                }}
              />
            </div>
          )}

          {request.status === "paid" && (
            <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-6 text-center mt-6">
              <h2 className="text-2xl font-bold text-green-400 mb-3">
                Payment Complete
              </h2>

              <p className="text-slate-300 mb-6">
                Your payment was received successfully.
              </p>

              <button
                onClick={() => router.push(`/requests/${requestId}`)}
                className="bg-purple-600 hover:bg-purple-700 px-6 py-3 rounded-xl text-white font-semibold"
              >
                Back to Request
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}