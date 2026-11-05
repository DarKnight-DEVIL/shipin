"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bricolage_Grotesque } from "next/font/google";
import { ArrowLeft, ArrowUpRight, LayoutGrid } from "lucide-react";

import "./not-found.css";

const display = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});

export default function NotFound() {
  const pathname = usePathname();

  return (
    <main className={`nf ${display.variable}`}>
      <Link href="/" className="nf__brand">
        <span className="nf__mark" aria-hidden="true">
          <ArrowUpRight size={16} strokeWidth={2.8} />
        </span>
        <span>
          Ship<em>IN</em>
        </span>
      </Link>

      <div className="nf__body">
        <span className="nf__stamp">Error 404</span>

        <div className="nf__code" aria-label="404">
          <span className="nf__digit">4</span>
          <svg className="nf__ring" viewBox="0 0 100 100" aria-hidden="true">
            <defs>
              <linearGradient id="nf-grad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="#ffc23d" />
                <stop offset="0.55" stopColor="#ff6b1a" />
                <stop offset="1" stopColor="#ff3d6e" />
              </linearGradient>
            </defs>
            <circle cx="50" cy="50" r="38" fill="none" stroke="url(#nf-grad)" strokeWidth="13" />
            <circle cx="50" cy="50" r="23" fill="none" stroke="#3d362d" strokeWidth="1.5" strokeDasharray="3 5" />
            <circle cx="50" cy="50" r="4" fill="#ff6b1a" />
          </svg>
          <span className="nf__digit">4</span>
        </div>

        <h1 className="nf__title">We can&apos;t find that page</h1>
        <p className="nf__sub">
          The link may be broken, or the page may have moved. Let&apos;s get you
          back on route.
        </p>

        <dl className="nf__card">
          <div className="nf__row">
            <dt>Requested</dt>
            <dd title={pathname ?? undefined}>{pathname || "/"}</dd>
          </div>
          <div className="nf__row">
            <dt>Status</dt>
            <dd>
              <span className="nf__status">Not found</span>
            </dd>
          </div>
        </dl>

        <div className="nf__actions">
          <Link href="/" className="nf__btn nf__btn--primary">
            <ArrowLeft size={16} />
            Back to home
          </Link>
          <Link href="/dashboard" className="nf__btn nf__btn--ghost">
            <LayoutGrid size={16} />
            Go to dashboard
          </Link>
        </div>

        <p className="nf__help">
          Still stuck? <Link href="/support">Contact support</Link>
        </p>
      </div>
    </main>
  );
}