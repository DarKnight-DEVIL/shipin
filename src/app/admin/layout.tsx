"use client";

import Link from "next/link";
import {
  LogOut,
  LayoutDashboard,
  Wallet,
  Inbox,
  MessageCircle,
  ShieldCheck,
} from "lucide-react";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useState } from "react";

import AdminGuard from "./AdminGuard";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [loggingOut, setLoggingOut] = useState(false);

  async function handleLogout() {
    if (loggingOut) return;

    setLoggingOut(true);

    try {
      await signOut(auth);

      window.location.replace("/login");
    } catch (error) {
      console.error(
        "Admin logout failed:",
        error
      );

      setLoggingOut(false);
    }
  }

  return (
    <AdminGuard>
      <main className="h-screen overflow-hidden bg-slate-950 text-white">
        <div className="flex h-full">

          {/* =========================================
              SIDEBAR
          ========================================= */}
          <aside
            className="
              fixed
              left-0
              top-0
              z-40
              flex
              h-screen
              w-72
              flex-col
              border-r
              border-slate-800
              bg-slate-900
              p-6
            "
          >

            {/* LOGO */}
            <div>
              <h1 className="text-3xl font-bold text-red-400">
                ShipIN Admin
              </h1>
            </div>

            {/* =========================================
                NAVIGATION
            ========================================= */}
            <nav className="mt-10 flex-1 space-y-2">

              {/* DASHBOARD */}
              <Link
                href="/admin/dashboard"
                className="
                  flex
                  items-center
                  gap-3
                  rounded-xl
                  px-4
                  py-3
                  text-slate-300
                  transition
                  hover:bg-slate-800
                  hover:text-white
                "
              >
                <LayoutDashboard
                  size={19}
                />

                <span>
                  Dashboard
                </span>
              </Link>

              {/* REQUESTS */}
              <Link
                href="/admin/requests"
                className="
                  flex
                  items-center
                  gap-3
                  rounded-xl
                  px-4
                  py-3
                  text-slate-300
                  transition
                  hover:bg-slate-800
                  hover:text-white
                "
              >
                <Inbox size={19} />

                <span>
                  Requests
                </span>
              </Link>

              {/* WALLET CREDITS */}
              <Link
                href="/admin/wallet"
                className="
                  flex
                  items-center
                  gap-3
                  rounded-xl
                  px-4
                  py-3
                  text-slate-300
                  transition
                  hover:bg-slate-800
                  hover:text-white
                "
              >
                <Wallet
                  size={19}
                />

                <span>
                  Wallet Credits
                </span>
              </Link>

              {/* AUDIT */}
              <div className="pt-6">
                <p className="px-4 pb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Audit
                </p>

                <Link
                  href="/admin/audit"
                  className="
                    flex
                    items-center
                    gap-3
                    rounded-xl
                    px-4
                    py-3
                    text-slate-300
                    transition
                    hover:bg-slate-800
                    hover:text-white
                  "
                >
                  <ShieldCheck size={19} />

                  <span>
                    Audit
                  </span>
                </Link>
              </div>

              {/* SUPPORT */}
              <Link
                href="/admin/support"
                className="
                  flex
                  items-center
                  gap-3
                  rounded-xl
                  px-4
                  py-3
                  text-slate-300
                  transition
                  hover:bg-slate-800
                  hover:text-white
                "
              >
                <MessageCircle size={19} />

                <span>
                  Support
                </span>
              </Link>

            </nav>

            {/* =========================================
                LOGOUT
            ========================================= */}
            <div className="border-t border-slate-800 pt-5">
              <button
                type="button"
                onClick={handleLogout}
                disabled={loggingOut}
                className="
                  flex
                  w-full
                  items-center
                  gap-3
                  rounded-xl
                  px-4
                  py-3
                  text-sm
                  font-medium
                  text-slate-300
                  transition
                  hover:bg-red-500/10
                  hover:text-red-400
                  disabled:cursor-not-allowed
                  disabled:opacity-50
                "
              >
                <LogOut size={19} />

                <span>
                  {loggingOut
                    ? "Logging out..."
                    : "Logout"}
                </span>
              </button>
            </div>

          </aside>

          {/* =========================================
              SCROLLABLE CONTENT
          ========================================= */}
          <section
            className="
              ml-72
              h-screen
              flex-1
              overflow-y-auto
            "
          >
            <div className="min-h-full p-8">
              {children}
            </div>
          </section>

        </div>
      </main>
    </AdminGuard>
  );
}