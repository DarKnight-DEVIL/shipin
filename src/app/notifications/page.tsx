"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { auth } from "@/lib/firebase";
import ConfirmDialog from "@/components/ui/ConfirmDialog";

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

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("all");
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  /*
   * LOAD NOTIFICATIONS
   */
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

  /*
   * COUNTS
   */
  const unreadCount = notifications.filter(
    (notification) => !notification.read
  ).length;

  /*
   * FILTERING
   */
  const filteredNotifications = useMemo(() => {
    return notifications.filter((notification) => {
      if (filter === "all") {
        return true;
      }

      if (filter === "unread") {
        return !notification.read;
      }

      if (filter === "payments") {
        return notification.type === "payment";
      }

      if (filter === "support") {
        return notification.type === "support";
      }

      if (filter === "shipping") {
        return [
          "shipment",
          "shipped",
          "tracking",
          "warehouse",
          "delivered",
        ].includes(notification.type);
      }

      if (filter === "orders") {
        return [
          "order",
          "request",
          "quote",
          "purchase",
        ].includes(notification.type);
      }

      return true;
    });
  }, [notifications, filter]);

  /*
   * MARK ONE READ
   */
  async function handleMarkRead(notification: any) {
    if (notification.read) {
      return;
    }

    try {
      await markNotificationRead(notification.id);

      setNotifications((current) =>
        current.map((item) =>
          item.id === notification.id
            ? { ...item, read: true }
            : item
        )
      );
    } catch (error) {
      console.error("Failed to mark notification read:", error);
    }
  }

  /*
   * DELETE ONE
   */
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

  /*
   * MARK ALL READ
   */
  async function handleMarkAllRead() {
    const user = auth.currentUser;
    if (!user) return;

    try {
      await markAllNotificationsRead(user.uid);

      setNotifications((current) =>
        current.map((notification) => ({
          ...notification,
          read: true,
        }))
      );
    } catch (error) {
      console.error("Failed to mark all notifications read:", error);
    }
  }

  /*
   * CLEAR READ
   */
  async function handleClearRead() {
    const user = auth.currentUser;
    if (!user) return;

    const hasRead = notifications.some(
      (notification) => notification.read
    );

    if (!hasRead) return;

    try {
      await clearReadNotifications(user.uid);

      setNotifications((current) =>
        current.filter((notification) => !notification.read)
      );
    } catch (error) {
      console.error("Failed to clear notifications:", error);
    }
  }

  /*
   * ICON
   */
  function getIcon(type: string) {
    switch (type) {
      case "payment":
        return "💳";

      case "shipment":
      case "shipped":
      case "tracking":
        return "🚚";

      case "warehouse":
        return "📦";

      case "delivered":
        return "✓";

      case "refund":
        return "↩";

      case "support":
        return "💬";

      case "quote":
        return "📄";

      default:
        return "🔔";
    }
  }

  /*
   * DATE
   */
  function formatDate(createdAt: any) {
    if (!createdAt) {
      return "";
    }

    try {
      const date = createdAt.toDate
        ? createdAt.toDate()
        : new Date(createdAt.seconds * 1000);

      return date.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      });
    } catch {
      return "";
    }
  }

  if (loading) {
    return (
      <div className="p-8 text-slate-400">
        Loading notifications...
      </div>
    );
  }

  return (
    <div className="w-full px-6 py-8 lg:px-10">
      {/* HEADER */}
      <div className="mb-8">
        <Link
          href="/dashboard"
          className="
            mb-6 inline-flex items-center gap-2 text-sm font-medium
            text-slate-600 hover:text-purple-600
            dark:text-slate-400 dark:hover:text-purple-400
            transition
          "
        >
          ← Back to Dashboard
        </Link>

        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <h1 className="text-4xl font-bold text-slate-950 dark:text-white">
              Notifications
            </h1>

            <p className="mt-2 text-slate-600 dark:text-slate-400">
              Updates about your requests, payments, shipments and support.
            </p>
          </div>

          {/* ACTION BUTTONS */}
          <div className="flex flex-wrap gap-3">
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="
                  rounded-xl border
                  border-slate-300 bg-white
                  px-4 py-2 text-sm font-medium
                  text-slate-700
                  hover:border-purple-400
                  hover:text-purple-600

                  dark:border-slate-700
                  dark:bg-slate-900
                  dark:text-slate-300
                  dark:hover:border-purple-500
                  dark:hover:text-purple-400

                  transition
                "
              >
                Mark all as read
              </button>
            )}

            {notifications.some(
              (notification) => notification.read
            ) && (
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="
                  rounded-xl border
                  border-slate-300 bg-white
                  px-4 py-2 text-sm font-medium
                  text-slate-600
                  hover:border-red-400
                  hover:text-red-600

                  dark:border-slate-700
                  dark:bg-slate-900
                  dark:text-slate-400
                  dark:hover:border-red-500/50
                  dark:hover:text-red-400

                  transition
                "
              >
                Clear read
              </button>
            )}
          </div>
        </div>
      </div>

      {/* FILTERS */}
      <div className="mb-6 flex flex-wrap gap-2">
        <FilterButton
          label="All"
          count={notifications.length}
          active={filter === "all"}
          onClick={() => setFilter("all")}
        />

        <FilterButton
          label="Unread"
          count={unreadCount}
          active={filter === "unread"}
          onClick={() => setFilter("unread")}
        />

        <FilterButton
          label="Orders"
          active={filter === "orders"}
          onClick={() => setFilter("orders")}
        />

        <FilterButton
          label="Payments"
          active={filter === "payments"}
          onClick={() => setFilter("payments")}
        />

        <FilterButton
          label="Shipping"
          active={filter === "shipping"}
          onClick={() => setFilter("shipping")}
        />

        <FilterButton
          label="Support"
          active={filter === "support"}
          onClick={() => setFilter("support")}
        />
      </div>

      {/* NOTIFICATION LIST */}
      <div
        className="
          overflow-visible rounded-2xl border
          border-slate-200 bg-white
          shadow-sm

          dark:border-slate-800
          dark:bg-slate-900
          dark:shadow-none
        "
      >
        {filteredNotifications.length === 0 ? (
          /* EMPTY STATE */
          <div className="px-6 py-16 text-center">
            <div
              className="
                mx-auto flex h-12 w-12
                items-center justify-center
                rounded-xl
                bg-slate-100 text-xl
                dark:bg-slate-800
              "
            >
              🔔
            </div>

            <h2 className="mt-4 text-lg font-semibold text-slate-950 dark:text-white">
              No notifications
            </h2>

            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
              Nothing to show for this filter.
            </p>
          </div>
        ) : (
          filteredNotifications.map((notification) => (
            <div
              key={notification.id}
              className={`
                relative flex gap-4
                border-b border-slate-200
                px-6 py-5
                last:border-b-0
                transition

                dark:border-slate-800

                ${
                  !notification.read
                    ? `
                      bg-purple-50/70
                      dark:bg-purple-500/[0.05]
                    `
                    : `
                      bg-white
                      dark:bg-slate-900
                    `
                }
              `}
            >
              {/* UNREAD INDICATOR */}
              {!notification.read && (
                <div className="absolute inset-y-0 left-0 w-[3px] bg-purple-500" />
              )}

              {/* ICON */}
              <div
                className={`
                  flex h-11 w-11 shrink-0
                  items-center justify-center
                  rounded-xl

                  ${
                    notification.read
                      ? `
                        bg-slate-100
                        dark:bg-slate-800
                      `
                      : `
                        bg-purple-100
                        dark:bg-purple-500/10
                      `
                  }
                `}
              >
                {getIcon(notification.type)}
              </div>

              {/* CONTENT */}
              <Link
                href={
                  notification.requestId
                    ? `/requests/${notification.requestId}`
                    : "/notifications"
                }
                onClick={() => handleMarkRead(notification)}
                className="min-w-0 flex-1"
              >
                <div className="flex items-start justify-between gap-6">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h2
                        className={`truncate ${
                          notification.read
                            ? `
                              font-medium
                              text-slate-800
                              dark:text-slate-200
                            `
                            : `
                              font-semibold
                              text-slate-950
                              dark:text-white
                            `
                        }`}
                      >
                        {notification.title}
                      </h2>

                      {!notification.read && (
                        <span className="h-2 w-2 shrink-0 rounded-full bg-purple-500" />
                      )}
                    </div>

                    <p className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-400">
                      {notification.message}
                    </p>
                  </div>

                  <span className="shrink-0 text-xs text-slate-400 dark:text-slate-500">
                    {formatDate(notification.createdAt)}
                  </span>
                </div>
              </Link>

              {/* OPTIONS MENU */}
              <div className="relative shrink-0">
                <button
                  type="button"
                  onClick={() =>
                    setOpenMenu(
                      openMenu === notification.id
                        ? null
                        : notification.id
                    )
                  }
                  className="
                    flex h-9 w-9
                    items-center justify-center
                    rounded-lg text-xl

                    text-slate-500
                    hover:bg-slate-100
                    hover:text-slate-950

                    dark:text-slate-500
                    dark:hover:bg-slate-800
                    dark:hover:text-white

                    transition
                  "
                  aria-label="Notification options"
                >
                  ⋯
                </button>

                {/* DROPDOWN */}
                {openMenu === notification.id && (
                  <div
                    className="
                      absolute right-0 top-10 z-50
                      w-48 overflow-hidden
                      rounded-xl border
                      border-slate-200
                      bg-white
                      shadow-xl

                      dark:border-slate-700
                      dark:bg-slate-950
                    "
                  >
                    {!notification.read && (
                      <button
                        type="button"
                        onClick={async () => {
                          await handleMarkRead(notification);
                          setOpenMenu(null);
                        }}
                        className="
                          w-full px-4 py-3
                          text-left text-sm

                          text-slate-700
                          hover:bg-slate-100

                          dark:text-slate-300
                          dark:hover:bg-slate-800

                          transition
                        "
                      >
                        Mark as read
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() =>
                        handleDelete(notification.id)
                      }
                      className="
                        w-full px-4 py-3
                        text-left text-sm
                        text-red-600
                        hover:bg-red-50

                        dark:text-red-400
                        dark:hover:bg-red-500/10

                        transition
                      "
                    >
                      Delete notification
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      <ConfirmDialog
        open={showDeleteConfirm}
        title="Delete Notifications"
        message="Delete all read notifications? This action cannot be undone."
        confirmText="Delete"
        danger
        onCancel={() => setShowDeleteConfirm(false)}
        onConfirm={async () => {
          setShowDeleteConfirm(false);
          await handleClearRead();
        }}
      />
    </div>
  );
}

/* =========================================
   FILTER BUTTON
========================================= */

function FilterButton({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count?: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`
        rounded-xl px-4 py-2
        text-sm font-medium
        transition

        ${
          active
            ? `
              bg-purple-600
              text-white
              shadow-sm
            `
            : `
              border border-slate-200
              bg-white
              text-slate-600

              hover:border-purple-300
              hover:text-purple-600

              dark:border-slate-800
              dark:bg-slate-900
              dark:text-slate-400

              dark:hover:border-purple-500/50
              dark:hover:text-purple-400
            `
        }
      `}
    >
      {label}

      {count !== undefined && (
        <span
          className={`ml-2 ${
            active
              ? "text-purple-200"
              : "text-slate-400 dark:text-slate-500"
          }`}
        >
          {count}
        </span>
      )}
    </button>
  );
}