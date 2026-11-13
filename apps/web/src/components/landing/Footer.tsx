"use client";

import Link from "next/link";
import type { FooterColumn } from "@/config/landing";

interface FooterProps {
  columns: FooterColumn[];
  companyInfo: {
    name: string;
    tagline: string;
    address: string;
    hours: string;
    email: string;
    year: number;
    status: string;
  };
}

export default function Footer({
  columns,
  companyInfo,
}: FooterProps) {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="footer" role="contentinfo">
      <div className="shell">
        <div className="footer__grid">
          <div className="footer__brand">
            <Link href="/" className="footer__logo" aria-label={`${companyInfo.name} home`}>
              <span className="footer__name">
                {companyInfo.name.replace("IN", "<span>IN</span>")}
              </span>
            </Link>
            <p>{companyInfo.tagline}</p>
            <p className="footer__address">
              {companyInfo.address} · {companyInfo.hours}
            </p>
          </div>

          {columns.map((column) => (
            <nav key={column.title} className="footer__nav" aria-label={column.title}>
              <h2>{column.title}</h2>
              <ul>
                {column.links.map((link) => (
                  <li key={link.href}>
                    <Link href={link.href} className="footer__link">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}

          <nav className="footer__nav" aria-label="Legal">
            <h2>Legal</h2>
            <ul>
              <li>
                <Link href="/privacy-policy" className="footer__link">
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link href="/terms" className="footer__link">
                  Terms of Service
                </Link>
              </li>
            </ul>
          </nav>
        </div>

        <div className="footer__base">
          <span>© {currentYear} {companyInfo.name}</span>
          <span className="status status--footer" aria-live="polite">
            <span className="status__dot" aria-hidden="true" />
            {companyInfo.status}
          </span>
          <span>Designed and run in Mumbai</span>
          <Link href="/privacy-policy" className="footer__link">
            Privacy
          </Link>
          <Link href="/terms" className="footer__link">
            Terms
          </Link>
        </div>
      </div>
    </footer>
  );
}