"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { BellOff, MoreHorizontal } from "lucide-react";

import { auth } from "@/lib/firebase";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import EmptyState from "@/components/ui/EmptyState";

import {
  getNotifications,
  markNotificationRead,
  deleteNotification,
  markAllNotificationsRead,
  clearReadNotifications,
} from "@/lib/firestore";

type Filter =
  | "all"
  | "unread"
  | "orders"
  | "payments"
  | "shipping"
  | "support";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "unread", label: "Unread" },
  { id: "orders", label: "Orders" },
  { id: "payments", label: "Payments" },
  { id: "shipping", label: "Shipping" },
  { id: "support", label: "Support" },
];

function formatDate(createdAt: any) {
  if (!createdAt) return "";
  try {
    const date = createdAt.toDate
      ? createdAt.toDate()
      : new Date(createdAt.seconds * 1000);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  } catch {
    return "";
  }
}

function typeLabel(type?: string) {
  switch (type) {
    case "payment":
      return "Payment";
    case "shipment":
    case "shipped":
    case "tracking":
      return "Shipping";
    case "warehouse":
      return "Warehouse";
    case "delivered":
      return "Delivered";
    case "refund":
      return "Refund";
    case "support":
      return "Support";
    case "quote":
      return "Quote";
    case "order":
    case "request":
    case "purchase":
      return "Order";
    default:
      return "Update";
  }
}

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("all");
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [clearing, setClearing] = useState(false);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      if (!user) {
        setNotifications([]);
        setLoading(false);
        return;
      }

      try {
        const data = await getNotifications(user.uid);
        data.sort((a: any, b: any) => {
          const aTime = a.createdAt?.seconds ?? 0;
          const bTime = b.createdAt?.seconds ?? 0;
          return bTime - aTime;
        });
        setNotifications(data);
      } catch (error) {
        console.error("Failed to load notifications:", error);
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  // Close menu on outside click
  useEffect(() => {
    if (!openMenu) return;
    const onDoc = () => setOpenMenu(null);
    document.addEventListener("click", onDoc);
    return () => document.removeEventListener("click", onDoc);
  }, [openMenu]);

  const unreadCount = notifications.filter((n) => !n.read).length;
  const hasRead = notifications.some((n) => n.read);

  const filteredNotifications = useMemo(() => {
    return notifications.filter((n) => {
      if (filter === "all") return true;
      if (filter === "unread") return !n.read;
      if (filter === "payments") return n.type === "payment";
      if (filter === "support") return n.type === "support";
      if (filter === "shipping") {
        return ["shipment", "shipped", "tracking", "warehouse", "delivered"].includes(
          n.type
        );
      }
      if (filter === "orders") {
        return ["order", "request", "quote", "purchase"].includes(n.type);
      }
      return true;
    });
  }, [notifications, filter]);

  async function handleMarkRead(notification: any) {
    if (notification.read) return;
    try {
      await markNotificationRead(notification.id);
      setNotifications((current) =>
        current.map((item) =>
          item.id === notification.id ? { ...item, read: true } : item
        )
      );
    } catch (error) {
      console.error("Failed to mark notification read:", error);
    }
  }

  async function handleDelete(notificationId: string) {
    try {
      await deleteNotification(notificationId);
      setNotifications((current) =>
        current.filter((item) => item.id !== notificationId)
      );
      setOpenMenu(null);
    } catch (error) {
      console.error("Failed to delete notification:", error);
    }
  }

  async function handleMarkAllRead() {
    const user = auth.currentUser;
    if (!user) return;
    try {
      await markAllNotificationsRead(user.uid);
      setNotifications((current) =>
        current.map((n) => ({ ...n, read: true }))
      );
    } catch (error) {
      console.error("Failed to mark all notifications read:", error);
    }
  }

  async function handleClearRead() {
    const user = auth.currentUser;
    if (!user) return;
    if (!notifications.some((n) => n.read)) return;
    await clearReadNotifications(user.uid);
    setNotifications((current) => current.filter((n) => !n.read));
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <div className="mb-8 h-7 w-40 animate-pulse rounded-lg bg-slate-200 dark:bg-slate-800" />
        <div className="mb-4 flex gap-2">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-8 w-16 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800/60"
            />
          ))}
        </div>
        <div className="space-y-2">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-16 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800/40"
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">
            Notifications
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {unreadCount > 0
              ? `${unreadCount} unread`
              : "You're up to date"}
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={handleMarkAllRead}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Mark all read
            </button>
          )}
          {hasRead && (
            <button
              type="button"
              onClick={() => setShowDeleteConfirm(true)}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-500 transition hover:border-red-200 hover:text-red-600 dark:border-slate-700 dark:text-slate-400 dark:hover:border-red-500/40 dark:hover:text-red-400"
            >
              Clear read
            </button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="mb-5 flex flex-wrap gap-1.5">
        {FILTERS.map((f) => {
          const active = filter === f.id;
          const count =
            f.id === "all"
              ? notifications.length
              : f.id === "unread"
                ? unreadCount
                : undefined;

          return (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                active
                  ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                  : "text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
              }`}
            >
              {f.label}
              {count !== undefined && (
                <span
                  className={`ml-1.5 tabular-nums ${
                    active
                      ? "text-slate-400 dark:text-slate-500"
                      : "text-slate-400"
                  }`}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* List */}
      {filteredNotifications.length === 0 ? (
        <EmptyState
          icon={<BellOff size={22} />}
          title={filter === "unread" ? "No unread notifications" : "Nothing here"}
          description={
            filter === "all"
              ? "Updates about requests, payments, and shipping will show up here."
              : "Try another filter."
          }
        />
      ) : (
        <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
          {filteredNotifications.map((notification) => {
            const href = notification.requestId
              ? `/requests/${notification.requestId}`
              : "/notifications";

            return (
              <li
                key={notification.id}
                className={`relative flex gap-3 px-4 py-3.5 sm:px-5 ${
                  !notification.read
                    ? "bg-slate-50/80 dark:bg-slate-800/30"
                    : ""
                }`}
              >
                {!notification.read && (
                  <span className="absolute left-0 top-3 bottom-3 w-0.5 rounded-full bg-slate-900 dark:bg-white" />
                )}

                <Link
                  href={href}
                  onClick={() => handleMarkRead(notification)}
                  className="min-w-0 flex-1"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
                          {typeLabel(notification.type)}
                        </span>
                        {!notification.read && (
                          <span className="h-1.5 w-1.5 rounded-full bg-slate-900 dark:bg-white" />
                        )}
                      </div>
                      <p
                        className={`mt-0.5 text-sm ${
                          notification.read
                            ? "font-medium text-slate-700 dark:text-slate-300"
                            : "font-semibold text-slate-900 dark:text-white"
                        }`}
                      >
                        {notification.title}
                      </p>
                      {notification.message && (
                        <p className="mt-0.5 line-clamp-2 text-sm leading-5 text-slate-500 dark:text-slate-400">
                          {notification.message}
                        </p>
                      )}
                    </div>
                    <span className="shrink-0 pt-0.5 text-xs tabular-nums text-slate-400">
                      {formatDate(notification.createdAt)}
                    </span>
                  </div>
                </Link>

                <div className="relative shrink-0">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setOpenMenu(
                        openMenu === notification.id ? null : notification.id
                      );
                    }}
                    className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                    aria-label="Options"
                  >
                    <MoreHorizontal size={16} />
                  </button>

                  {openMenu === notification.id && (
                    <div
                      className="absolute right-0 top-8 z-50 w-40 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-900"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {!notification.read && (
                        <button
                          type="button"
                          onClick={async () => {
                            await handleMarkRead(notification);
                            setOpenMenu(null);
                          }}
                          className="w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800"
                        >
                          Mark as read
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleDelete(notification.id)}
                        className="w-full px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10"
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <ConfirmDialog
        open={showDeleteConfirm}
        title="Clear read notifications?"
        message="This removes every notification you've already opened. Unread ones stay."
        confirmText="Clear"
        danger
        loading={clearing}
        onCancel={() => {
          if (!clearing) setShowDeleteConfirm(false);
        }}
        onConfirm={async () => {
          setClearing(true);
          try {
            await handleClearRead();
            setShowDeleteConfirm(false);
          } catch (error) {
            console.error("Failed to clear notifications:", error);
          } finally {
            setClearing(false);
          }
        }}
      />
    </div>
  );
}