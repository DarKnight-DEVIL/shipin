"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { doc, updateDoc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { statusLabels as importedStatusLabels } from "@/lib/statusLabels";
import { statusColors } from "@/lib/statusColors";
import SupportCenter from "@/components/support/SupportCenter";
import { canCreateSupportTicket } from "@/lib/support";

// Hoisted configuration structures outside the component body 
// to prevent re-creation on every re-render cycle.
const TIMELINE = [
  "submitted",
  "review",
  "payment",
  "awaiting_payment",
  "paid",
  "purchased",
  "warehouse_received",
  "packed",
  "shipped",
  "out_for_delivery",
  "delivered",
];

const TIMELINE_LABELS: Record<string, string> = {
  submitted: "Request Received",
  review: "Reviewing Products",
  payment: "Quote Ready",
  awaiting_payment: "Awaiting Payment",
  paid: "Payment Confirmed",
  purchased: "Items Purchased",
  warehouse_received: "Arrived at ShipIN Warehouse",
  packed: "Preparing Shipment",
  shipped: "In Transit",
  out_for_delivery: "Out for Delivery",
  delivered: "Delivered Successfully",
  refunded: "Refunded",
};

export default function RequestDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const requestId = params.id as string;

  const [request, setRequest] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [approving, setApproving] = useState(false);

  useEffect(() => {
    if (!requestId) return;

    const requestRef = doc(db, "requests", requestId);

    const unsubscribe = onSnapshot(
      requestRef,
      (snapshot) => {
        if (snapshot.exists()) {
          setRequest({
            id: snapshot.id,
            ...snapshot.data(),
          });
        } else {
          setRequest(null);
        }
        setLoading(false);
      },
      (error) => {
        console.error(error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [requestId]);

  const handleApproveQuote = async () => {
    if (!requestId) return;

    setApproving(true);

    try {
      const requestRef = doc(db, "requests", requestId);

      await updateDoc(requestRef, {
        status: "awaiting_payment",
      });

      router.push(`/payment/${requestId}`);
    } catch (error) {
      console.error(error);
      alert(
        error instanceof Error
          ? error.message
          : "Something went wrong approving the quote."
      );
    } finally {
      setApproving(false);
    }
  };

  if (loading) {
    return <div className="p-8 text-white">Loading request...</div>;
  }

  if (!request) {
    return <div className="p-8 text-white">Request not found.</div>;
  }

  const currentIndex =
    request.status === "refunded" ? -1 : TIMELINE.indexOf(request.status);

  return (
    <div className="p-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 mb-8">
        <h1 className="text-4xl font-bold text-white mb-4">
          Request #{request.id.slice(0, 6)}
        </h1>

        <div
          className={`inline-flex items-center px-4 py-2 rounded-full border text-sm font-semibold ${
            statusColors[request.status] ||
            "bg-slate-500/10 text-slate-400 border-slate-500/20"
          }`}
        >
          {importedStatusLabels[request.status] || request.status}
        </div>
      </div>

      {/* Shipment Progress Timeline */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 mb-8">
        <h2 className="text-2xl font-semibold text-white mb-6">
          Shipment Progress
        </h2>

        <div className="space-y-4">
          {TIMELINE.map((status, index) => {
            const completed = index <= currentIndex;
            const active = index === currentIndex;

            return (
              <div key={status} className="flex items-center gap-4">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                    completed
                      ? "bg-green-500 text-white"
                      : "bg-slate-800 text-slate-500"
                  }`}
                >
                  {completed ? "✓" : index + 1}
                </div>

                <div>
                  <div
                    className={`font-medium ${
                      completed ? "text-white" : "text-slate-500"
                    } ${active ? "text-green-400" : ""}`}
                  >
                    {TIMELINE_LABELS[status]}
                  </div>
                </div>
              </div>
            );
          })}

          {request.status === "refunded" && (
            <div className="flex items-center gap-4 mt-6">
              <div className="w-8 h-8 rounded-full bg-red-500 flex items-center justify-center text-white font-bold">
                ✕
              </div>
              <div className="text-red-400 font-semibold">Order Refunded</div>
            </div>
          )}
        </div>
      </div>

      {/* Tracking Card Component */}
      {request.tracking && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 mb-8">
          <h2 className="text-2xl font-semibold text-white mb-4">
            Tracking Information
          </h2>

          <div className="space-y-3">
            <div>
              <span className="text-slate-400">Carrier:</span>{" "}
              <span className="text-white">{request.tracking.carrier}</span>
            </div>

            <div>
              <span className="text-slate-400">Tracking Number:</span>{" "}
              <span className="text-white">
                {request.tracking.trackingNumber}
              </span>
            </div>

            <div>
              <span className="text-slate-400">Estimated Delivery:</span>{" "}
              <span className="text-white">
                {request.tracking.estimatedDelivery}
              </span>
            </div>

            {request.tracking.trackingUrl && (
              <a
                href={request.tracking.trackingUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block mt-4 bg-blue-600 hover:bg-blue-700 px-6 py-3 rounded-xl font-semibold"
              >
                Track Package
              </a>
            )}
          </div>
        </div>
      )}

      {/* Products */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 mb-8">
        <h2 className="text-2xl font-semibold text-white mb-6">Products</h2>

        <div className="space-y-6">
          {request.items?.map((item: any, index: number) => {
            const quoteItem = request.quote?.items?.[index];

            return (
              <div
                key={index}
                className="border border-slate-800 rounded-xl p-4"
              >
                <h3 className="text-xl font-semibold text-white">
                  {item.name}
                </h3>

                <div className="text-slate-400 mt-2">
                  Quantity: {item.quantity}
                </div>

                <div className="text-slate-500 text-sm break-all mt-2 mb-3">
                  {item.url}
                </div>

                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block bg-purple-600 hover:bg-purple-700 px-4 py-2 rounded-lg text-sm font-medium mb-4"
                >
                  View Product
                </a>

                {quoteItem && (
                  <div className="mt-4 border-t border-slate-800 pt-4 space-y-2">
                    <div className="flex justify-between text-slate-300">
                      <span>Unit Price</span>
                      <span>${quoteItem.unitPrice?.toFixed(2)}</span>
                    </div>

                    <div className="flex justify-between text-slate-300">
                      <span>Quantity</span>
                      <span>{quoteItem.quantity}</span>
                    </div>

                    <div className="flex justify-between text-green-400 font-semibold text-lg">
                      <span>Subtotal</span>
                      <span>${quoteItem.subtotal?.toFixed(2)}</span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Quote Breakdown */}
      {request.quote && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 mb-8">
          <h2 className="text-2xl font-semibold text-white mb-6">
            Additional Charges
          </h2>

          <div className="space-y-3">
            <div className="flex justify-between text-slate-300">
              <span>Domestic Shipping</span>
              <span>${request.quote.domesticShipping?.toFixed(2)}</span>
            </div>

            <div className="flex justify-between text-slate-300">
              <span>International Shipping</span>
              <span>${request.quote.internationalShipping?.toFixed(2)}</span>
            </div>

            <div className="flex justify-between text-slate-300">
              <span>Customs Duties</span>
              <span>${request.quote.customs?.toFixed(2)}</span>
            </div>

            <div className="flex justify-between text-slate-300">
              <span>ShipIN Service Fee</span>
              <span>${request.quote.serviceFee?.toFixed(2)}</span>
            </div>

            <div className="border-t border-slate-800 pt-4 mt-4">
              <div className="flex justify-between text-xl font-bold text-white">
                <span>Products Total</span>
                <span>${request.quote.productsTotal?.toFixed(2)}</span>
              </div>

              <div className="flex justify-between text-2xl font-bold text-green-400 mt-4">
                <span>Grand Total</span>
                <span>${request.quote.grandTotal?.toFixed(2)}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="space-y-6">
        {request.quote && request.status === "payment" && (
          <div>
            <button
              onClick={handleApproveQuote}
              disabled={approving}
              className="bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed px-8 py-4 rounded-xl font-semibold mb-4"
            >
              {approving ? "Approving..." : "Approve Quote"}
            </button>
          </div>
        )}

        {/* Continue to Payment */}
        {request.status === "awaiting_payment" && !request.payment && (
          <div>
            <button
              onClick={() => router.push(`/payment/${requestId}`)}
              className="bg-purple-600 hover:bg-purple-700 px-8 py-4 rounded-xl font-semibold mb-4"
            >
              Continue to Payment
            </button>
          </div>
        )}

        {/* Support Module */}
        <SupportCenter
          requestId={request.id}
          customerId={request.userId}
          canCreateTicket={canCreateSupportTicket(request)}
        />
      </div>
    </div>
  );
}