"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { auth } from "@/lib/firebase";
import { subscribeToRequests } from "@/lib/firestore";
import { statusLabels } from "@/lib/statusLabels";
import { statusColors } from "@/lib/statusColors";
import type { Request } from "@/types/request";

const cardMessage: Record<
  string,
  { text: string; style: string }
> = {
  review: {
    text: "Your request is being reviewed",
    style:
      "bg-blue-500/10 border-blue-500/20 text-blue-700 dark:text-blue-300",
  },

  awaiting_payment: {
    text: "Payment Required • Click to complete checkout",
    style:
      "bg-yellow-500/10 border-yellow-500/20 text-yellow-700 dark:text-yellow-300",
  },

  purchased: {
    text: "Updates Available • Click to view shipment progress",
    style:
      "bg-blue-500/10 border-blue-500/20 text-blue-700 dark:text-blue-300",
  },

  warehouse_received: {
    text: "Updates Available • Click to view shipment progress",
    style:
      "bg-blue-500/10 border-blue-500/20 text-blue-700 dark:text-blue-300",
  },

  packed: {
    text: "Updates Available • Click to view shipment progress",
    style:
      "bg-blue-500/10 border-blue-500/20 text-blue-700 dark:text-blue-300",
  },

  shipped: {
    text: "Updates Available • Click to track your shipment",
    style:
      "bg-blue-500/10 border-blue-500/20 text-blue-700 dark:text-blue-300",
  },

  out_for_delivery: {
    text: "Updates Available • Delivery is approaching",
    style:
      "bg-blue-500/10 border-blue-500/20 text-blue-700 dark:text-blue-300",
  },
};

export default function RequestsPage() {
  const [requests, setRequests] =
    useState<Request[]>([]);

  const [loading, setLoading] =
    useState(true);

  useEffect(() => {
    let unsubscribeRequests:
      | (() => void)
      | undefined;

    const unsubscribeAuth =
      auth.onAuthStateChanged((user) => {
        if (!user) {
          setRequests([]);
          setLoading(false);

          if (unsubscribeRequests) {
            unsubscribeRequests();
          }

          return;
        }

        unsubscribeRequests =
          subscribeToRequests(
            user.uid,
            (data: Request[]) => {
              setRequests(data);
              setLoading(false);
            }
          );
      });

    return () => {
      unsubscribeAuth();

      if (unsubscribeRequests) {
        unsubscribeRequests();
      }
    };
  }, []);

  if (loading) {
    return (
      <div className="p-8 text-slate-500 dark:text-slate-400">
        Loading requests...
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl p-8">

      {/* Header */}
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">

        <div>
          <h1 className="text-4xl font-bold text-slate-950 dark:text-white">
            My Requests
          </h1>

          <p className="mt-2 text-slate-500 dark:text-slate-400">
            View and manage your ShipIN
            purchase requests.
          </p>
        </div>

        <Link
          href="/requests/new"
          className="inline-flex items-center justify-center rounded-xl bg-purple-600 px-5 py-3 font-semibold text-white transition hover:bg-purple-700"
        >
          + New Request
        </Link>

      </div>

      {/* Empty state */}
      {requests.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:shadow-none">

          <h2 className="mb-3 text-2xl font-semibold text-slate-950 dark:text-white">
            No requests yet
          </h2>

          <p className="mb-6 text-slate-500 dark:text-slate-400">
            Create your first ShipIN request
            to start shopping from India.
          </p>

          <Link
            href="/requests/new"
            className="inline-block rounded-xl bg-purple-600 px-6 py-3 font-semibold text-white transition hover:bg-purple-700"
          >
            Create Request
          </Link>

        </div>
      ) : (

        <div className="space-y-6">

          {requests.map((request) => {
            const dynamicBanner =
              cardMessage[request.status];

            const itemCount =
              request.items?.length ?? 0;

            return (
              <Link
                key={request.id}
                href={`/requests/${request.id}`}
                className="block"
              >

                <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:border-purple-500 hover:shadow-md dark:border-slate-800 dark:bg-slate-900 dark:shadow-none dark:hover:border-purple-500">

                  {/* Request header */}
                  <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">

                    <div>

                      <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
                        Purchase Request
                      </p>

                      <h2 className="mb-3 text-xl font-semibold text-slate-950 dark:text-white">
                        Request #
                        {request.id
                          .slice(0, 6)
                          .toUpperCase()}
                      </h2>

                      <div
                        className={`inline-flex items-center rounded-full border px-4 py-2 text-sm font-semibold ${
                          statusColors[
                            request.status
                          ] ||
                          "border-slate-300 bg-slate-100 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400"
                        }`}
                      >
                        {statusLabels[
                          request.status
                        ] ||
                          request.status}
                      </div>

                    </div>

                    <div className="self-start rounded-xl bg-purple-500/10 px-4 py-2 font-medium text-purple-700 dark:text-purple-300">
                      {itemCount}{" "}
                      {itemCount === 1
                        ? "Item"
                        : "Items"}
                    </div>

                  </div>

                  {/* Products */}
                  {itemCount > 0 && (
                    <div className="space-y-3">

                      {request.items.map(
                        (
                          item: any,
                          index: number
                        ) => (
                          <div
                            key={index}
                            className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950"
                          >

                            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">

                              <div className="min-w-0">

                                <h3 className="font-semibold text-slate-900 dark:text-white">
                                  {item.name}
                                </h3>

                                <p className="mt-1 break-all text-sm text-slate-500 dark:text-slate-500">
                                  {item.url}
                                </p>

                              </div>

                              <div className="shrink-0 text-sm font-medium text-slate-600 dark:text-slate-400">
                                Qty:{" "}
                                {item.quantity}
                              </div>

                            </div>

                          </div>
                        )
                      )}

                    </div>
                  )}

                  {/* Action banner */}
                  {dynamicBanner && (
                    <div
                      className={`mt-6 rounded-xl border p-4 font-medium ${dynamicBanner.style}`}
                    >
                      {dynamicBanner.text}
                    </div>
                  )}

                  {/* Notes */}
                  {(request as any).notes && (
                    <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950">

                      <h3 className="mb-2 font-semibold text-slate-900 dark:text-white">
                        Notes
                      </h3>

                      <p className="text-slate-600 dark:text-slate-400">
                        {(request as any).notes}
                      </p>

                    </div>
                  )}

                  {/* Footer */}
                  <div className="mt-6 flex justify-end border-t border-slate-200 pt-4 dark:border-slate-800">

                    <span className="font-medium text-purple-600 dark:text-purple-400">
                      View Request →
                    </span>

                  </div>

                </article>

              </Link>
            );
          })}

        </div>
      )}

    </div>
  );
}