"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { ArrowUpRight } from "./icons";

interface SiteHeaderProps {
  accountHref: string;
  accountLabel: string;
  startHref: string;
}

export default function SiteHeader({
  accountHref,
  accountLabel,
  startHref,
}: SiteHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!menuOpen) return;

    const body = document.body;
    body.style.overflow = "hidden";

    const panel = menuRef.current;
    const getFocusable = () =>
      Array.from(
        panel?.querySelectorAll<HTMLElement>(
          "a[href], button:not([disabled])"
        ) ?? []
      ).filter((element) => element.offsetParent !== null);

    const focusTimer = window.setTimeout(() => getFocusable()[0]?.focus(), 60);

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setMenuOpen(false);
        menuButtonRef.current?.focus();
        return;
      }
      if (event.key !== "Tab") return;

      const items = getFocusable();
      if (items.length === 0) return;

      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;

      if (event.shiftKey && (active === first || !panel?.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    const desktop = window.matchMedia("(min-width: 901px)");
    const onChange = () => {
      if (desktop.matches) setMenuOpen(false);
    };

    document.addEventListener("keydown", onKeyDown);
    desktop.addEventListener("change", onChange);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener("keydown", onKeyDown);
      desktop.removeEventListener("change", onChange);
      body.style.overflow = "";
    };
  }, [menuOpen]);

  const closeMenu = () => setMenuOpen(false);

  return (
    <>
      <header className="site-header">
        <div className="shell site-header__inner">
          <Link href="/" className="brand" aria-label="ShipIN home">
            <span className="brand__mark" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none">
                <rect
                  x="1.5"
                  y="1.5"
                  width="21"
                  height="21"
                  rx="5"
                  fill="currentColor"
                />
                <path
                  d="M7 14.5h8.5M12 10.5l4 4-4 4"
                  stroke="var(--paper)"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <circle cx="7" cy="9" r="1.5" fill="var(--rust)" />
              </svg>
            </span>
            <span className="brand__name">
              Ship<span>IN</span>
            </span>
          </Link>

          <nav className="nav" aria-label="Primary">
            <a href="#platform">Pipeline</a>
            <a href="#network">Network</a>
            <a href="#pricing">Pricing</a>
            <a href="#faq">FAQ</a>
          </nav>

          <div className="site-header__actions">
            <Link href={accountHref} className="text-link site-header__account">
              {accountLabel}
            </Link>
            <Link href={startHref} className="btn btn--primary btn--sm">
              Start a request
              <ArrowUpRight />
            </Link>
            <button
              ref={menuButtonRef}
              type="button"
              className="menu-button"
              aria-expanded={menuOpen}
              aria-controls="mobile-menu"
              aria-label={menuOpen ? "Close menu" : "Open menu"}
              onClick={() => setMenuOpen((open) => !open)}
            >
              <span
                className={
                  menuOpen ? "menu-button__bars is-open" : "menu-button__bars"
                }
                aria-hidden="true"
              >
                <span />
                <span />
              </span>
            </button>
          </div>
        </div>
      </header>

      {menuOpen && (
        <div
          ref={menuRef}
          className="mobile-menu"
          id="mobile-menu"
          role="dialog"
          aria-modal="true"
          aria-label="Site menu"
        >
          <nav aria-label="Mobile">
            <a href="#platform" onClick={closeMenu}>
              Pipeline
            </a>
            <a href="#network" onClick={closeMenu}>
              Network
            </a>
            <a href="#pricing" onClick={closeMenu}>
              Pricing
            </a>
            <a href="#faq" onClick={closeMenu}>
              FAQ
            </a>
          </nav>
          <div className="mobile-menu__foot">
            <Link
              href={accountHref}
              className="btn btn--ghost"
              onClick={closeMenu}
            >
              {accountLabel}
            </Link>
            <Link
              href={startHref}
              className="btn btn--primary"
              onClick={closeMenu}
            >
              Start a request
              <ArrowUpRight />
            </Link>
            <p className="mono-note">
              Mumbai hub · Replies within one business day
            </p>
          </div>
        </div>
      )}
    </>
  );
}
