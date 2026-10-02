"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import {
  Bell,
  ChevronRight,
  CirclePlus,
  LayoutDashboard,
  LogOut,
  MapPin,
  Menu,
  PackageSearch,
  Settings,
  WalletCards,
  MessageCircle,
  X,
} from "lucide-react";

import { signOut } from "firebase/auth";

import { auth } from "@/lib/firebase";
import { subscribeToNotifications } from "@/lib/firestore";

export default function PlatformLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();

  const [unreadCount, setUnreadCount] =
    useState(0);

  const [mobileOpen, setMobileOpen] =
    useState(false);

  const [userName, setUserName] =
    useState("");

  const [userEmail, setUserEmail] =
    useState("");

  /*
   * AUTH + NOTIFICATIONS
   */
  useEffect(() => {
    let unsubscribeNotifications:
      | (() => void)
      | undefined;

    const unsubscribeAuth =
      auth.onAuthStateChanged((user) => {
        if (!user) {
          if (unsubscribeNotifications) {
            unsubscribeNotifications();
            unsubscribeNotifications =
              undefined;
          }

          setUnreadCount(0);
          setUserName("");
          setUserEmail("");

          return;
        }

        setUserName(
          user.displayName ||
            user.email?.split("@")[0] ||
            "ShipIN Customer"
        );

        setUserEmail(user.email || "");

        /*
         * Clean up any previous notification
         * listener before creating another.
         */
        if (unsubscribeNotifications) {
          unsubscribeNotifications();
        }

        unsubscribeNotifications =
          subscribeToNotifications(
            user.uid,
            (notifications) => {
              const unread =
                notifications.filter(
                  (notification: any) =>
                    !notification.read
                ).length;

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

  /*
   * Close mobile sidebar after navigation.
   */
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  /*
   * LOGOUT
   */
  async function handleLogout() {
    try {
      await signOut(auth);

      router.replace("/login");
    } catch (error) {
      console.error(
        "Logout failed:",
        error
      );
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950 dark:bg-slate-950 dark:text-white">

      {/* MOBILE HEADER */}

      <header
        className="
          sticky top-0 z-40
          flex h-16 items-center
          justify-between
          border-b border-slate-200
          bg-white px-5

          dark:border-slate-800
          dark:bg-slate-900

          md:hidden
        "
      >
        <Link
          href="/dashboard"
          className="text-2xl font-bold text-slate-950 dark:text-white"
        >
          Ship
          <span className="text-purple-600 dark:text-purple-400">
            IN
          </span>
        </Link>

        <div className="flex items-center gap-2">

          <Link
            href="/notifications"
            className="
              relative flex h-10 w-10
              items-center justify-center
              rounded-xl
              text-slate-600
              hover:bg-slate-100

              dark:text-slate-400
              dark:hover:bg-slate-800
            "
          >
            <Bell size={20} />

            {unreadCount > 0 && (
              <span
                className="
                  absolute right-0 top-0
                  flex min-h-5 min-w-5
                  items-center justify-center
                  rounded-full bg-purple-600
                  px-1 text-[10px]
                  font-bold text-white
                "
              >
                {unreadCount > 99
                  ? "99+"
                  : unreadCount}
              </span>
            )}
          </Link>

          <button
            type="button"
            onClick={() =>
              setMobileOpen(true)
            }
            className="
              flex h-10 w-10
              items-center justify-center
              rounded-xl
              text-slate-600
              hover:bg-slate-100

              dark:text-slate-400
              dark:hover:bg-slate-800
            "
          >
            <Menu size={22} />
          </button>

        </div>
      </header>


      {/* MOBILE BACKDROP */}

      {mobileOpen && (
        <button
          type="button"
          aria-label="Close navigation"
          onClick={() =>
            setMobileOpen(false)
          }
          className="
            fixed inset-0 z-40
            bg-black/50
            backdrop-blur-[2px]
            md:hidden
          "
        />
      )}


      {/* SIDEBAR */}

      <aside
        className={`
          fixed inset-y-0 left-0 z-50
          flex w-72 flex-col
          border-r border-slate-200
          bg-white
          transition-transform duration-200

          dark:border-slate-800
          dark:bg-slate-900

          md:w-64
          md:translate-x-0

          ${
            mobileOpen
              ? "translate-x-0"
              : "-translate-x-full"
          }
        `}
      >

        {/* LOGO */}

        <div
          className="
            flex h-20 items-center
            justify-between px-6
          "
        >
          <Link
            href="/dashboard"
            className="text-3xl font-bold text-slate-950 dark:text-white"
          >
            Ship
            <span className="text-purple-600 dark:text-purple-400">
              IN
            </span>
          </Link>

          <button
            type="button"
            onClick={() =>
              setMobileOpen(false)
            }
            className="
              flex h-9 w-9
              items-center justify-center
              rounded-lg
              text-slate-500
              hover:bg-slate-100

              dark:hover:bg-slate-800

              md:hidden
            "
          >
            <X size={20} />
          </button>
        </div>


        {/* NAVIGATION */}

        <nav className="flex-1 overflow-y-auto px-4 py-4">

          <p
            className="
              mb-3 px-3
              text-[11px] font-semibold
              uppercase tracking-wider
              text-slate-400
              dark:text-slate-600
            "
          >
            Overview
          </p>

          <div className="space-y-1">

            <NavItem
              href="/dashboard"
              label="Dashboard"
              icon={
                <LayoutDashboard
                  size={19}
                />
              }
              pathname={pathname}
            />

            <NavItem
              href="/requests"
              label="My Requests"
              icon={
                <PackageSearch
                  size={19}
                />
              }
              pathname={pathname}
              exact
            />

            <NavItem
              href="/requests/new"
              label="Create Request"
              icon={
                <CirclePlus
                  size={19}
                />
              }
              pathname={pathname}
            />

          </div>


          <p
            className="
              mb-3 mt-8 px-3
              text-[11px] font-semibold
              uppercase tracking-wider
              text-slate-400
              dark:text-slate-600
            "
          >
            Account
          </p>

          <div className="space-y-1">

            <NavItem
              href="/addresses"
              label="Addresses"
              icon={
                <MapPin size={19} />
              }
              pathname={pathname}
            />

            <NavItem
              href="/wallet"
              label="Wallet"
              icon={
                <WalletCards size={19} />
              }
              pathname={pathname}
            />
            <NavItem
              href="/support"
              label="Support"
              icon={
                <MessageCircle size={19} />
              }
              pathname={pathname}
            />
            
            <NavItem
              href="/notifications"
              label="Notifications"
              icon={
                <Bell size={19} />
              }
              pathname={pathname}
              badge={unreadCount}
            />

            <NavItem
              href="/settings"
              label="Settings"
              icon={
                <Settings size={19} />
              }
              pathname={pathname}
            />

          </div>

        </nav>


        {/* USER AREA */}

        <div
          className="
            border-t border-slate-200
            p-4
            dark:border-slate-800
          "
        >

          <div
            className="
              mb-2 flex items-center
              gap-3 rounded-xl
              px-3 py-3
            "
          >

            {/* AVATAR */}

            <div
              className="
                flex h-10 w-10
                shrink-0 items-center
                justify-center
                rounded-full
                bg-purple-100
                font-bold text-purple-700

                dark:bg-purple-500/10
                dark:text-purple-300
              "
            >
              {getInitials(userName)}
            </div>


            {/* USER INFO */}

            <div className="min-w-0 flex-1">

              <p
                className="
                  truncate text-sm
                  font-semibold
                  text-slate-900
                  dark:text-white
                "
              >
                {userName ||
                  "ShipIN Customer"}
              </p>

              <p
                className="
                  truncate text-xs
                  text-slate-500
                  dark:text-slate-500
                "
              >
                {userEmail}
              </p>

            </div>

          </div>


          {/* LOGOUT */}

          <button
            type="button"
            onClick={handleLogout}
            className="
              flex w-full items-center
              gap-3 rounded-xl
              px-3 py-2.5
              text-sm font-medium
              text-slate-600
              transition

              hover:bg-red-50
              hover:text-red-600

              dark:text-slate-400
              dark:hover:bg-red-500/10
              dark:hover:text-red-400
            "
          >
            <LogOut size={18} />

            Logout
          </button>

        </div>

      </aside>


      {/* PAGE CONTENT */}

      <section
        className="
          min-h-screen
          md:ml-64
        "
      >
        {children}
      </section>

    </main>
  );
}


/* =========================================
   NAV ITEM
========================================= */

function NavItem({
  href,
  label,
  icon,
  pathname,
  badge,
  exact = false,
}: {
  href: string;
  label: string;
  icon: React.ReactNode;
  pathname: string;
  badge?: number;
  exact?: boolean;
}) {
  /*
   * /requests should NOT remain selected
   * when /requests/new is active.
   */
  const active = exact
    ? pathname === href
    : pathname === href ||
      pathname.startsWith(
        `${href}/`
      );

  return (
    <Link
      href={href}
      className={`
        group flex items-center
        gap-3 rounded-xl
        px-3 py-2.5
        text-sm font-medium
        transition

        ${
          active
            ? `
              bg-purple-50
              text-purple-700

              dark:bg-purple-500/10
              dark:text-purple-300
            `
            : `
              text-slate-600
              hover:bg-slate-100
              hover:text-slate-950

              dark:text-slate-400
              dark:hover:bg-slate-800
              dark:hover:text-white
            `
        }
      `}
    >

      <span
        className={
          active
            ? "text-purple-600 dark:text-purple-400"
            : "text-slate-400 group-hover:text-slate-700 dark:text-slate-500 dark:group-hover:text-slate-300"
        }
      >
        {icon}
      </span>

      <span className="flex-1">
        {label}
      </span>

      {badge !== undefined &&
        badge > 0 && (
          <span
            className="
              flex min-h-5 min-w-5
              items-center justify-center
              rounded-full
              bg-purple-600 px-1.5
              text-[10px] font-bold
              text-white
            "
          >
            {badge > 99
              ? "99+"
              : badge}
          </span>
        )}

      {active && !badge && (
        <ChevronRight
          size={15}
          className="text-purple-400"
        />
      )}

    </Link>
  );
}


/* =========================================
   USER INITIALS
========================================= */

function getInitials(
  name: string
) {
  if (!name) {
    return "S";
  }

  const parts = name
    .trim()
    .split(/\s+/);

  if (parts.length === 1) {
    return parts[0]
      .slice(0, 1)
      .toUpperCase();
  }

  return (
    parts[0][0] +
    parts[parts.length - 1][0]
  ).toUpperCase();
}