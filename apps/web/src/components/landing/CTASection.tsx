"use client";

import Link from "next/link";

import { ArrowUpRight } from "./icons";

interface CTASectionProps {
  startHref: string;
}

export default function CTASection({ startHref }: CTASectionProps) {
  return (
    <section className="cta">
      <div className="shell">
        <div className="cta__panel">
          <div>
            <h2>Send the link. We handle the rest.</h2>
            <p>
              Start with one order, then add stores, SKUs and delivery addresses
              as you grow.
            </p>
          </div>
          <div className="cta__action">
            <Link href={startHref} className="btn btn--ink">
              Start a request
              <ArrowUpRight />
            </Link>
            <p className="mono-note cta__note">No account needed for a quote</p>
          </div>
        </div>
      </div>
    </section>
  );
}
