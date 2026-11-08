import Link from "next/link";
import { Plus } from "lucide-react";
import { Bell, LayoutGrid, MapPin, Menu, MessageCircle, Package, Settings, Wallet, X } from "lucide-react";

import Brand from "./Brand";
import NavItem from "./NavItem";
import UserAvatar from "./UserAvatar";

interface SidebarProps {
  pathname: string;
  unreadCount: number;
  userName: string;
  userEmail: string;
  mobileOpen: boolean;
  onOpenMobile: () => void;
  onCloseMobile: () => void;
  onLogout: () => void;
}

const WORKSPACE_ITEMS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/requests", label: "Requests" },
  { href: "/wallet", label: "Wallet" },
  { href: "/addresses", label: "Addresses" },
];

const ACCOUNT_ITEMS = [
  { href: "/notifications", label: "Notifications" },
  { href: "/support", label: "Support" },
  { href: "/settings", label: "Settings" },
];

export default function Sidebar({
  pathname,
  unreadCount,
  userName,
  userEmail,
  mobileOpen,
  onOpenMobile,
  onCloseMobile,
  onLogout,
}: SidebarProps) {
  return (
    <>
      {/* MOBILE HEADER */}
      <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-[var(--border)] bg-[var(--card)]/95 px-4 backdrop-blur md:hidden">
        <Brand />

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
            onClick={onOpenMobile}
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
          onClick={onCloseMobile}
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
          <Brand />

          <button
            type="button"
            onClick={onCloseMobile}
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

        <nav aria-label="Main" className="flex-1 overflow-y-auto px-3 py-4">
          <p className="app-kicker px-2.5 pb-2">Workspace</p>

          <div className="space-y-0.5">
            {WORKSPACE_ITEMS.map((item) => (
              <NavItem
                key={item.href}
                href={item.href}
                label={item.label}
                icon={getWorkspaceIcon(item.href)}
                pathname={pathname}
                exact={item.href === "/dashboard" || item.href === "/requests"}
              />
            ))}
          </div>

          <p className="app-kicker mt-6 px-2.5 pb-2">Account</p>

          <div className="space-y-0.5">
            {ACCOUNT_ITEMS.map((item) => (
              <NavItem
                key={item.href}
                href={item.href}
                label={item.label}
                icon={getAccountIcon(item.href)}
                pathname={pathname}
                badge={item.href === "/notifications" ? unreadCount : undefined}
              />
            ))}
          </div>
        </nav>

        <div className="border-t border-[var(--border)] p-3">
          <UserAvatar
            userName={userName}
            userEmail={userEmail}
            onLogout={onLogout}
          />
        </div>
      </aside>
    </>
  );
}

function getWorkspaceIcon(href: string) {
  if (href === "/dashboard") return <LayoutGrid size={16} />;
  if (href === "/requests") return <Package size={16} />;
  if (href === "/wallet") return <Wallet size={16} />;
  if (href === "/addresses") return <MapPin size={16} />;
  return <Package size={16} />;
}

function getAccountIcon(href: string) {
  if (href === "/notifications") return <Bell size={16} />;
  if (href === "/support") return <MessageCircle size={16} />;
  if (href === "/settings") return <Settings size={16} />;
  return <Bell size={16} />;
}
