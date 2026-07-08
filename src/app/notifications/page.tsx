"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { auth } from "@/lib/firebase";
import {
  getNotifications,
  markNotificationRead,
} from "@/lib/firestore";

export default function NotificationsPage() {
  const [notifications, setNotifications] =
    useState<any[]>([]);

  const [loading, setLoading] =
    useState(true);

  useEffect(() => {
    const unsubscribe =
      auth.onAuthStateChanged(
        async (user) => {
          if (!user) {
            setLoading(false);
            return;
          }

          const data =
            await getNotifications(
              user.uid
            );

          data.sort(
            (a: any, b: any) => {
              const aTime =
                a.createdAt?.seconds || 0;

              const bTime =
                b.createdAt?.seconds || 0;

              return bTime - aTime;
            }
          );

          setNotifications(data);
          setLoading(false);
        }
      );

    return () => unsubscribe();
  }, []);

  const getIcon = (
    type: string
  ) => {
    switch (type) {
      case "payment":
        return "💳";

      case "shipment":
        return "🚚";

      case "delivered":
        return "✅";

      case "refund":
        return "💰";

      case "support":
        return "💬";

      default:
        return "🔔";
    }
  };

  if (loading) {
    return (
      <div className="p-8 text-white">
        Loading notifications...
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto p-8">
      <h1 className="text-4xl font-bold text-white mb-8">
        Notifications
      </h1>

      {notifications.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center">
          <h2 className="text-2xl text-white mb-2">
            No notifications yet
          </h2>

          <p className="text-slate-400">
            Updates from ShipIN will
            appear here.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {notifications.map(
            (
              notification
            ) => (
              <Link
                key={
                  notification.id
                }
                href={`/requests/${notification.requestId}`}
                onClick={async () => {
                  if (
                    !notification.read
                  ) {
                    await markNotificationRead(
                      notification.id
                    );

                    setNotifications(
                      (
                        prev
                      ) =>
                        prev.map(
                          (
                            n
                          ) =>
                            n.id ===
                            notification.id
                              ? {
                                  ...n,
                                  read: true,
                                }
                              : n
                        )
                    );
                  }
                }}
              >
                <div
                  className={`rounded-2xl border p-6 transition hover:border-purple-500 cursor-pointer ${
                    notification.read
                      ? "bg-slate-900 border-slate-800"
                      : "bg-purple-500/10 border-purple-500/20"
                  }`}
                >
                  <div className="flex items-start gap-4">
                    <div className="text-3xl">
                      {getIcon(
                        notification.type
                      )}
                    </div>

                    <div className="flex-1">
                      <h2 className="text-xl font-semibold text-white mb-2">
                        {
                          notification.title
                        }
                      </h2>

                      <p className="text-slate-300">
                        {
                          notification.message
                        }
                      </p>

                      {!notification.read && (
                        <div className="mt-4 inline-block bg-purple-600 px-3 py-1 rounded-lg text-sm">
                          New
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </Link>
            )
          )}
        </div>
      )}
    </div>
  );
}