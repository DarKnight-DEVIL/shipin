"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { doc, updateDoc } from "firebase/firestore";
import { PayPalButtons } from "@paypal/react-paypal-js";

import { db } from "@/lib/firebase";
import { getRequestById } from "@/lib/firestore";
import type { Request } from "@/types/request";

export default function PaymentPage() {
  const params = useParams();
  const router = useRouter();

  const requestId = params.id as string;

  const [request, setRequest] = useState<Request | null>(null);
  const [loading, setLoading] = useState(true);
  const [showPaypal, setShowPaypal] = useState(false);

  useEffect(() => {
    if (!requestId) return;

    const loadRequest = async () => {
      try {
        const data = await getRequestById(requestId);
        if (data) {
          setRequest(data);

          if (data.status === "awaiting_payment") {
            setShowPaypal(false);
          }

          if (data.status === "paid") {
            setShowPaypal(true);
          }
        }
      } catch (error) {
        console.error(error);
      }

      setLoading(false);
    };

    loadRequest();
  }, [requestId]);

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

  const showAcceptQuote = request.status === "review";
  const showCompletePayment =
    request.status === "awaiting_payment" && !showPaypal;

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
            <span>{request.status}</span>
          </div>

          <div className="flex justify-between text-slate-300">
            <span>Products Total</span>
            <span>
              ${request.quote?.breakdown.productsTotal?.toFixed(2) || "0.00"}
            </span>
          </div>

          <div className="flex justify-between text-slate-300">
            <span>Domestic Shipping</span>
            <span>
              ${request.quote?.breakdown.domesticShipping?.toFixed(2) || "0.00"}
            </span>
          </div>

          <div className="flex justify-between text-slate-300">
            <span>International Shipping</span>
            <span>
              $
              {request.quote?.breakdown.internationalShipping?.toFixed(2) ||
                "0.00"}
            </span>
          </div>

          <div className="flex justify-between text-slate-300">
            <span>ShipIN Fee</span>
            <span>
              ${request.quote?.breakdown.serviceFee?.toFixed(2) || "0.00"}
            </span>
          </div>

          <div className="border-t border-slate-800 pt-4">
            <div className="flex justify-between text-3xl font-bold text-green-400">
              <span>Grand Total</span>
              <span>
                ${request.quote?.breakdown.grandTotal?.toFixed(2) || "0.00"}
              </span>
            </div>
          </div>
        </div>

        <div className="flex flex-col">
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
                  ? "bg-green-600 hover:bg-green-700"
                  : "bg-purple-600 hover:bg-purple-700"
              }`}
            >
              {showAcceptQuote ? "Accept Quote" : "Complete Payment"}
            </button>
          )}

          {showPaypal && request.status !== "paid" && (
            <div className="mt-6">
              <PayPalButtons
                createOrder={async () => {
                  const response = await fetch(
                    "/api/paypal/create-order",
                    {
                      method: "POST",
                      headers: {
                        "Content-Type": "application/json",
                      },
                      body: JSON.stringify({
                        amount: request.quote?.breakdown.grandTotal,
                      }),
                    }
                  );

                  const data = await response.json();

                  if (!data.id) {
                    console.error("Create order failed:", data);
                    alert(
                      "Could not start PayPal checkout. Please try again."
                    );
                    throw new Error("No order ID returned");
                  }

                  return data.id;
                }}
                onApprove={async (data) => {
                  alert("onApprove started");
                  console.log("onApprove started");

                  try {
                    const response = await fetch(
                      "/api/paypal/capture-order",
                      {
                        method: "POST",
                        headers: {
                          "Content-Type": "application/json",
                        },
                        body: JSON.stringify({
                          requestId,
                          orderID: data.orderID,
                        }),
                      }
                    );

                    alert("Capture API returned");

                    const captureData = await response.json();

                    console.log(captureData);
                    alert(captureData.status);

                    if (captureData.status === "COMPLETED") {
                      setRequest((prev) =>
                        prev
                          ? {
                              ...prev,
                              status: "paid",
                            }
                          : prev
                      );

                      alert("Payment successful!");
                    } else {
                      console.error(
                        "Capture did not complete:",
                        captureData
                      );
                      alert("Payment failed.");
                    }
                  } catch (e) {
                    console.error(e);
                    alert("ERROR: " + String(e));
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
                className="bg-purple-600 hover:bg-purple-700 px-6 py-3 rounded-xl"
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