"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Bricolage_Grotesque } from "next/font/google";

import {
  ArrowUpRight,
  Bell,
  LayoutGrid,
  LogOut,
  MapPin,
  Menu,
  MessageCircle,
  Package,
  Plus,
  Settings,
  Wallet,
  X,
} from "lucide-react";

import { signOut } from "firebase/auth";

import { auth } from "@/lib/firebase";
import { subscribeToNotifications } from "@/lib/firestore";

import "./app-theme.css";

const display = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});

export default function PlatformLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();

  const [unreadCount, setUnreadCount] = useState(0);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [userName, setUserName] = useState("");
  const [userEmail, setUserEmail] = useState("");

  /*
   * AUTH + NOTIFICATIONS
   */
  useEffect(() => {
    let unsubscribeNotifications: (() => void) | undefined;

    const unsubscribeAuth = auth.onAuthStateChanged((user) => {
      if (!user) {
        if (unsubscribeNotifications) {
          unsubscribeNotifications();
          unsubscribeNotifications = undefined;
        }

        setUnreadCount(0);
        setUserName("");
        setUserEmail("");

        return;
      }

      setUserName(
        user.displayName || user.email?.split("@")[0] || "ShipIN customer"
      );

      setUserEmail(user.email || "");

      if (unsubscribeNotifications) {
        unsubscribeNotifications();
      }

      unsubscribeNotifications = subscribeToNotifications(
        user.uid,
        (notifications) => {
          const unread = notifications.filter(
            (notification: any) => !notification.read
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

  async function handleLogout() {
    try {
      await signOut(auth);
      router.replace("/login");
    } catch (error) {
      console.error("Logout failed:", error);
    }
  }

  const initials = getInitials(userName);

  return (
    <main className={`shipin-app ${display.variable} min-h-screen bg-[var(--background)] text-[var(--foreground)]`}>
      {/* MOBILE HEADER */}
      <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-[var(--border)] bg-[var(--card)]/95 px-4 backdrop-blur md:hidden">
        <Link
          href="/dashboard"
          className="text-[17px] font-semibold tracking-[-0.03em] text-[var(--foreground)]"
        >
          <Brand />
        </Link>

        <div className="flex items-center gap-1">
          <Link
            href="/notifications"
            aria-label="Notifications"
            className="app-iconbtn relative h-9 w-9"
          >
            <Bell size={18} />
            {unreadCount > 0 && (
              <span className="absolute right-1 top-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-[var(--accent-solid)] px-1 text-[9px] font-semibold leading-none text-white">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </Link>

          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-label="Open navigation"
            className="app-iconbtn h-9 w-9"
          >
            <Menu size={19} />
          </button>
        </div>
      </header>

      {/* MOBILE BACKDROP */}
      {mobileOpen && (
        <button
          type="button"
          aria-label="Close navigation"
          onClick={() => setMobileOpen(false)}
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-[2px] md:hidden"
        />
      )}

      {/* SIDEBAR */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-[264px] flex-col border-r border-[var(--border)] bg-[var(--sidebar)] transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] md:w-[248px] md:translate-x-0 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-16 items-center justify-between px-5">
          <Link
            href="/dashboard"
            className="text-[18px] font-semibold tracking-[-0.03em] text-[var(--foreground)]"
          >
            <Brand />
          </Link>

          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            aria-label="Close navigation"
            className="-mr-2 flex h-9 w-9 items-center justify-center rounded-lg text-[var(--muted)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--foreground)] md:hidden"
          >
            <X size={18} />
          </button>
        </div>

        <div className="px-3 pb-1">
          <Link
            href="/requests/new"
            className="app-btn app-btn-secondary app-btn-block justify-start gap-2 px-2.5 font-medium text-[var(--muted)] hover:text-[var(--foreground)]"
          >
            <Plus size={15} className="text-[var(--muted)]" />
            New request
          </Link>
        </div>

        <nav
          aria-label="Main"
          className="flex-1 overflow-y-auto px-3 py-4"
        >
          <p className="app-kicker px-2.5 pb-2">Workspace</p>

          <div className="space-y-0.5">
            <NavItem
              href="/dashboard"
              label="Dashboard"
              icon={<LayoutGrid size={16} />}
              pathname={pathname}
              exact
            />
            <NavItem
              href="/requests"
              label="Requests"
              icon={<Package size={16} />}
              pathname={pathname}
              exact
            />
            <NavItem
              href="/wallet"
              label="Wallet"
              icon={<Wallet size={16} />}
              pathname={pathname}
            />
            <NavItem
              href="/addresses"
              label="Addresses"
              icon={<MapPin size={16} />}
              pathname={pathname}
            />
          </div>

          <p className="app-kicker mt-6 px-2.5 pb-2">Account</p>

          <div className="space-y-0.5">
            <NavItem
              href="/notifications"
              label="Notifications"
              icon={<Bell size={16} />}
              pathname={pathname}
              badge={unreadCount}
            />
            <NavItem
              href="/support"
              label="Support"
              icon={<MessageCircle size={16} />}
              pathname={pathname}
            />
            <NavItem
              href="/settings"
              label="Settings"
              icon={<Settings size={16} />}
              pathname={pathname}
            />
          </div>
        </nav>

        <div className="border-t border-[var(--border)] p-3">
          <div className="flex items-center gap-2.5 rounded-lg px-1.5 py-1.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--surface-3)] text-[11px] font-semibold text-[var(--foreground)]">
              {initials}
            </div>

            <div className="min-w-0 flex-1">
              <p className="truncate text-[12px] font-medium text-[var(--foreground)]">
                {userName || "ShipIN customer"}
              </p>
              <p className="truncate text-[11px] text-[var(--muted)]">
                {userEmail}
              </p>
            </div>

            <button
              type="button"
              onClick={handleLogout}
              aria-label="Sign out"
              title="Sign out"
              className="app-iconbtn h-8 w-8 hover:text-rose-600 dark:hover:text-rose-400"
            >
              <LogOut size={15} />
            </button>
          </div>
        </div>
      </aside>

      {/* PAGE CONTENT */}
      <section className="min-h-screen md:pl-[248px]">
        <div className="shipin-page">{children}</div>
      </section>
    </main>
  );
}

/* =========================================
   BRAND
========================================= */

function Brand() {
  return (
    <span className="inline-flex items-center gap-2">
      <span
        aria-hidden="true"
        className="dash-brandmark flex h-[22px] w-[22px] items-center justify-center rounded-[7px]"
      >
        <ArrowUpRight size={14} strokeWidth={2.8} />
      </span>
      <span style={{ fontFamily: "var(--display)" }}>
        Ship<span className="text-[var(--accent)]">IN</span>
      </span>
    </span>
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
  const active = exact
    ? pathname === href
    : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`group relative flex items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-[13px] transition-colors ${
        active
          ? "bg-[var(--surface-2)] font-medium text-[var(--foreground)]"
          : "text-[var(--muted)] hover:bg-[var(--surface-2)] hover:text-[var(--foreground)]"
      }`}
    >
      {active && (
        <span className="absolute left-0 top-1/2 h-4 w-[2px] -translate-y-1/2 rounded-full bg-[var(--accent-solid)]" />
      )}

      <span
        className={
          active
            ? "text-[var(--accent)]"
            : "text-[var(--muted-soft)] transition-colors group-hover:text-[var(--foreground)]"
        }
      >
        {icon}
      </span>

      <span className="flex-1 truncate">{label}</span>

      {badge !== undefined && badge > 0 && (
        <span className="rounded-full bg-[var(--surface-3)] px-1.5 py-0.5 text-[10px] font-semibold leading-none tabular-nums text-[var(--muted)]">
          {badge > 99 ? "99+" : badge}
        </span>
      )}
    </Link>
  );
}

/* =========================================
   USER INITIALS
========================================= */

function getInitials(name: string) {
  if (!name) {
    return "S";
  }

  const parts = name.trim().split(/\s+/);

  if (parts.length === 1) {
    return parts[0].slice(0, 1).toUpperCase();
  }

  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}