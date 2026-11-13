"use client";

import { useRef } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useAxeScan } from "@/lib/axeScan";

const SplineHero = dynamic(
  () =>
    import(
      /* webpackChunkName: "spline-hero" */
      /* webpackPrefetch: true */
      "@/components/landing/SplineHero"
    ),
  { ssr: false, loading: () => null }
);

export interface HeroSectionProps {
  onPlanSelect: (planId: "standard" | "express" | "merchant") => void;
}

export default function HeroSection({ onPlanSelect }: HeroSectionProps) {
  const heroRef = useRef<HTMLDivElement>(null);

  // Hooks must run during render, at the top level of the component — calling a
  // hook inside useEffect throws "Invalid hook call" and crashed the page.
  useAxeScan();

  return (
    <section className="hero" ref={heroRef} aria-labelledby="hero-title">
      <div className="hero__spline">
        <SplineHero />
      </div>

      <div className="hero__content shell">
        <header className="hero__head">
          <div className="hero__badge">New: Express tier — priority queue + photo QA</div>
          <h1 id="hero-title" className="hero__title">
            Ship from India to{" "}
            <span className="hero__highlight">anywhere</span>
            . No local address. No local payment.
          </h1>
          <p className="hero__lede">
            Paste a product link. We buy, inspect, consolidate and ship.
            Transparent quote upfront. No subscription.
          </p>

          <div className="hero__cta-group" role="group" aria-label="Choose a plan">
            <button
              type="button"
              className="btn btn--ghost hero__cta"
              onClick={() => onPlanSelect("standard")}
            >
              Try Standard (Free)
            </button>
            <button
              type="button"
              className="btn btn--accent hero__cta"
              onClick={() => onPlanSelect("express")}
            >
              Start Express ($9)
            </button>
          </div>
        </header>

        <div className="hero__trust" aria-label="Trusted by">
          <span className="hero__trust-label">Trusted by shoppers in</span>
          <div className="hero__markets" aria-hidden="true">
            {[
              "London",
              "Dubai",
              "Singapore",
              "New York",
              "Toronto",
              "Berlin",
              "Sydney",
              "Nairobi",
              "Tokyo",
              "São Paulo",
            ].map((market) => (
              <span key={market} className="hero__market">
                {market}
              </span>
            ))}
          </div>
        </div>

        <div className="hero__scroll" aria-hidden="true">
          <span>Scroll</span>
          <svg
            viewBox="0 0 24 24"
            width="24"
            height="24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 5v14M19 12l-7 7-7-7" />
          </svg>
        </div>
      </div>

      <Link
        href="/requests/new"
        className="hero__start-link"
        onClick={(e) => {
          e.preventDefault();
          onPlanSelect("standard");
        }}
      >
        <span>Start a request</span>
        <svg
          viewBox="0 0 16 16"
          width="16"
          height="16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M5 12h6M11 8l4 4-4 4" />
        </svg>
      </Link>
    </section>
  );
}