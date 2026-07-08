"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { auth } from "@/lib/firebase";
import { subscribeToRequests } from "@/lib/firestore";
import { statusLabels } from "@/lib/statusLabels";
import { statusColors } from "@/lib/statusColors";

// Banner status themes dictionary mapping
const cardMessage: Record<string, { text: string; style: string }> = {
  payment: {
    text: "Quote Available • Click to review",
    style: "bg-green-500/10 border-green-500/20 text-green-300",
  },
  awaiting_payment: {
    text: "Payment Required • Click to complete checkout",
    style: "bg-yellow-500/10 border-yellow-500/20 text-yellow-300",
  },
  purchased: {
    text: "Updates Available • Click to view shipment progress",
    style: "bg-blue-500/10 border-blue-500/20 text-blue-300",
  },
  warehouse_received: {
    text: "Updates Available • Click to view shipment progress",
    style: "bg-blue-500/10 border-blue-500/20 text-blue-300",
  },
  packed: {
    text: "Updates Available • Click to view shipment progress",
    style: "bg-blue-500/10 border-blue-500/20 text-blue-300",
  },
  shipped: {
    text: "Updates Available • Click to track your shipment",
    style: "bg-blue-500/10 border-blue-500/20 text-blue-300",
  },
  out_for_delivery: {
    text: "Updates Available • Delivery is approaching",
    style: "bg-blue-500/10 border-blue-500/20 text-blue-300",
  },
};

export default function RequestsPage() {
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsubscribeRequests: (() => void) | undefined;

    const unsubscribeAuth = auth.onAuthStateChanged((user) => {
      if (!user) {
        setRequests([]);
        setLoading(false);

        if (unsubscribeRequests) {
          unsubscribeRequests();
        }
        return;
      }

      unsubscribeRequests = subscribeToRequests(user.uid, (data) => {
        setRequests(data);
        setLoading(false);
      });
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeRequests) {
        unsubscribeRequests();
      }
    };
  }, []);

  if (loading) {
    return <div className="p-8 text-white">Loading requests...</div>;
  }

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <h1 className="text-4xl font-bold text-white mb-8">My Requests</h1>

      {requests.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-10 text-center">
          <h2 className="text-2xl font-semibold text-white mb-4">
            No requests found
          </h2>
          <p className="text-slate-400 mb-6">
            Create your first ShipIN request.
          </p>
          <Link
            href="/requests/new"
            className="inline-block bg-purple-600 hover:bg-purple-700 px-6 py-3 rounded-xl font-semibold"
          >
            Create Request
          </Link>
        </div>
      ) : (
        <div className="space-y-6">
          {requests.map((request) => {
            const dynamicBanner = cardMessage[request.status];

            return (
              <Link key={request.id} href={`/requests/${request.id}`}>
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 hover:border-purple-500 transition cursor-pointer">
                  
                  {/* Header */}
                  <div className="flex justify-between items-start mb-6">
                    <div>
                      <h2 className="text-xl font-semibold text-white mb-3">
                        Request #{request.id.slice(0, 6)}
                      </h2>
                      <div
                        className={`inline-flex items-center px-4 py-2 rounded-full border text-sm font-semibold ${
                          statusColors[request.status] ||
                          "bg-slate-500/10 text-slate-400 border-slate-500/20"
                        }`}
                      >
                        {statusLabels[request.status] || request.status}
                      </div>
                    </div>

                    <div className="bg-purple-600 px-4 py-2 rounded-xl text-white font-medium">
                      {request.items?.length || 0}{" "}
                      {request.items?.length === 1 ? "Item" : "Items"}
                    </div>
                  </div>

                  {/* Products List */}
                  <div className="space-y-3">
                    {request.items?.map((item: any, index: number) => (
                      <div
                        key={index}
                        className="border border-slate-800 rounded-xl p-4"
                      >
                        <div className="flex justify-between">
                          <div>
                            <h3 className="font-semibold text-white">
                              {item.name}
                            </h3>
                            <p className="text-slate-500 text-sm break-all">
                              {item.url}
                            </p>
                          </div>
                          <div className="text-slate-400">
                            Qty: {item.quantity}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Dynamic Alert Banner Segment */}
                  {dynamicBanner && (
                    <div
                      className={`mt-6 p-4 border rounded-xl font-medium ${dynamicBanner.style}`}
                    >
                      {dynamicBanner.text}
                    </div>
                  )}

                  {/* Notes Element */}
                  {request.notes && (
                    <div className="mt-6 p-4 bg-slate-950 rounded-xl">
                      <h3 className="font-semibold text-white mb-2">Notes</h3>
                      <p className="text-slate-400">{request.notes}</p>
                    </div>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}