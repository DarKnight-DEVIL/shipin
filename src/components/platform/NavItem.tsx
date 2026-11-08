import Link from "next/link";
import type { ReactNode } from "react";

interface NavItemProps {
  href: string;
  label: string;
  icon: ReactNode;
  pathname: string;
  badge?: number;
  exact?: boolean;
}

export default function NavItem({
  href,
  label,
  icon,
  pathname,
  badge,
  exact = false,
}: NavItemProps) {
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
