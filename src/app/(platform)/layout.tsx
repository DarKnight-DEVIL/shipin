"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { auth } from "@/lib/firebase";
import { subscribeToNotifications } from "@/lib/firestore";

export default function PlatformLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    let unsubscribeNotifications: (() => void) | undefined;

    const unsubscribeAuth = auth.onAuthStateChanged((user) => {
      if (!user) {
        if (unsubscribeNotifications) {
          unsubscribeNotifications();
        }
        setUnreadCount(0);
        return;
      }

      unsubscribeNotifications = subscribeToNotifications(
        user.uid,
        (notifications) => {
          const unread = notifications.filter((n: any) => !n.read).length;

          console.log(
            "Notifications:",
            notifications.length,
            "Unread:",
            unread
          );

          setUnreadCount(unread);
        }
      );
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeNotifications) {
        unsubscribeNotifications();
      }
    };
  }, []);

  return (
    <main className="min-h-screen bg-slate-950 text-white flex">
      {/* Sidebar */}
      <aside className="w-64 bg-slate-900 border-r border-slate-800 p-6 hidden md:flex flex-col">
        <h1 className="text-3xl font-bold text-purple-400 mb-10">
          ShipIN
        </h1>

        <nav className="space-y-4 flex-1">
          <Link
            href="/dashboard"
            className="block text-slate-300 hover:text-white transition"
          >
            Dashboard
          </Link>

          <Link
            href="/requests"
            className="block text-slate-300 hover:text-white transition"
          >
            My Requests
          </Link>

          <Link
            href="/requests/new"
            className="block text-slate-300 hover:text-white transition"
          >
            Create Request
          </Link>

          <Link
            href="/addresses"
            className="block text-slate-300 hover:text-white transition"
          >
            Addresses
          </Link>

          <Link
            href="/notifications"
            className="flex items-center justify-between text-slate-300 hover:text-white transition"
          >
            <span>Notifications</span>
            {/* Restored to conditional rendering */}
            {unreadCount > 0 && (
              <span className="bg-purple-600 text-white text-xs font-bold px-2 py-1 rounded-full min-w-[24px] text-center">
                {unreadCount}
              </span>
            )}
          </Link>

          <Link
            href="/settings"
            className="block text-slate-300 hover:text-white transition"
          >
            Settings
          </Link>
        </nav>

        <button className="text-red-400 hover:text-red-300 pt-8 text-left">
          Logout
        </button>
      </aside>

      {/* Main Content */}
      <section className="flex-1 overflow-y-auto">
        {children}
      </section>
    </main>
  );
}