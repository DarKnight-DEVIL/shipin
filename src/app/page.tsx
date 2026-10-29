"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Bricolage_Grotesque } from "next/font/google";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase";
import dynamic from "next/dynamic";
import type Lenis from "lenis";
import "lenis/dist/lenis.css";
import "./landing.css";

const GlobeDashboard = dynamic(
  () => import("@/components/globe-dashboard/GlobeDashboard"),
  {
    ssr: false,
    loading: () => <div className="globe-panel__loading" aria-hidden="true" />,
  }
);

const display = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});

type PlanId = "standard" | "express" | "merchant";

type Plan = {
  id: PlanId;
  code: string;
  name: string;
  price: string;
  unit: string;
  description: string;
  features: string[];
  cta: string;
  featured?: boolean;
};

const plans: Plan[] = [
  {
    id: "standard",
    code: "Tier 01",
    name: "Standard",
    price: "$0",
    unit: "per request",
    description: "For a first order or a single item you cannot get shipped.",
    features: [
      "Standard inspection at the hub",
      "Up to 3 SKUs per request",
      "2 origin stores",
      "Email support, Mon to Sat",
    ],
    cta: "Select Standard",
  },
  {
    id: "express",
    code: "Tier 02",
    name: "Express",
    price: "$9",
    unit: "per request",
    description: "For launches, samples and anything with a date attached.",
    features: [
      "Priority queue at every checkpoint",
      "Photo QA before dispatch",
      "30 days of free warehousing",
      "Consolidation included",
    ],
    cta: "Select Express",
    featured: true,
  },
  {
    id: "merchant",
    code: "Tier 03",
    name: "Merchant",
    price: "Freight",
    unit: "quoted per lane",
    description: "For teams moving 50 or more parcels a month.",
    features: [
      "Unlimited SKUs and stores",
      "Negotiated freight rates",
      "Dedicated account lead",
      "Net 15 terms on approval",
    ],
    cta: "Request a quote",
  },
];

const corridors = [
  { route: "Mumbai to London", transit: "5 to 7 days", cutoff: "Tue, Fri" },
  { route: "Mumbai to Dubai", transit: "3 to 4 days", cutoff: "Daily" },
  { route: "Mumbai to Singapore", transit: "3 to 5 days", cutoff: "Mon, Wed, Fri" },
  { route: "Mumbai to Berlin", transit: "6 to 8 days", cutoff: "Wed, Sat" },
  { route: "Mumbai to New York", transit: "7 to 9 days", cutoff: "Tue, Thu" },
  { route: "Mumbai to Toronto", transit: "8 to 10 days", cutoff: "Thu" },
];

const marketTicker = [
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
];

const metrics = [
  {
    value: "42",
    label: "Shipping corridors",
    detail: "Direct lanes from the Mumbai hub to six continents.",
  },
  {
    value: "6.2",
    label: "Median transit",
    detail: "Door to door, customs cleared, last quarter.",
  },
  {
    value: "40%",
    label: "Freight saved",
    detail: "Average reduction after consolidation and repacking.",
  },
  {
    value: "99.2%",
    label: "Manifest accuracy",
    detail: "Units matched to the photo set before export.",
  },
];

const steps = [
  {
    number: "01",
    title: "Send the link",
    body: "Paste a product URL from any Indian retailer. We confirm the seller, variant and live price before anything is charged.",
    meta: "Any Indian marketplace",
  },
  {
    number: "02",
    title: "We inspect it",
    body: "Every parcel stops at the Mumbai hub. Quantity, condition and serial numbers are checked against your order and photographed.",
    meta: "Photo QA on arrival",
  },
  {
    number: "03",
    title: "We pack as one",
    body: "Orders from different stores become a single manifest. Repacking cuts volumetric weight and one export filing covers the batch.",
    meta: "One manifest per batch",
  },
  {
    number: "04",
    title: "It moves",
    body: "Duties are quoted before dispatch, paperwork is pre-cleared, and the last mile is tracked to the address you gave us.",
    meta: "DDP on every lane",
  },
];

const faqs = [
  {
    question: "What can I order?",
    answer:
      "Anything sold by an Indian retailer that can be legally exported. Send the product URL. If the seller will not ship domestically, we arrange pickup from their store.",
  },
  {
    question: "How does payment work?",
    answer:
      "We quote in your billing currency and you approve once. ShipIN settles with the seller in INR, then invoices the consolidated total with freight and duties itemised line by line.",
  },
  {
    question: "Can I combine orders from different stores?",
    answer:
      "Yes. Orders that reach the hub inside the same seven day window ship as one manifest. Express includes consolidation; on Standard it is added per parcel.",
  },
  {
    question: "What happens if an item arrives damaged?",
    answer:
      "Nothing leaves the hub without a photo set. If an item is wrong or damaged on arrival, we hold the shipment, send you the images, and replace or refund it before dispatch.",
  },
  {
    question: "Do you handle customs and duties?",
    answer:
      "We file export documents from India and quote import duties before dispatch. DDP delivery is available on all corridors. If you use your own broker, choose DDU at checkout.",
  },
  {
    question: "How long does a request take?",
    answer:
      "Median door to door is 6.2 days across our corridors. A quote is usually back within one business day, and inspection happens the day your parcel reaches the hub.",
  },
];

function ArrowUpRight({ className = "" }: { className?: string }) {
  return (
    <svg
      className={className}
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4.5 11.5L11.5 4.5" />
      <path d="M5.5 4.5h6v6" />
    </svg>
  );
}

function Check() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M2.5 7.5l3 3 6-7" />
    </svg>
  );
}

export default function Home() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [activePlan, setActivePlan] = useState<Plan | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [globeMotion, setGlobeMotion] = useState(true);

  const lenisRef = useRef<Lenis | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  const startHref = loggedIn ? "/dashboard" : "/login?next=/requests/new";
  const accountHref = loggedIn ? "/dashboard" : "/login";
  const accountLabel = loggedIn ? "Dashboard" : "Sign in";

  useEffect(() => {
    if (!auth) return;
    try {
      return onAuthStateChanged(auth, (user) => setLoggedIn(Boolean(user)));
    } catch {
      setLoggedIn(false);
      return;
    }
  }, []);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let cancelled = false;
    let frame = 0;
    let lenis: Lenis | null = null;

    import("lenis").then(({ default: Lenis }) => {
      if (cancelled) return;
      lenis = new Lenis({
        duration: 1.05,
        smoothWheel: true,
        anchors: true,
      });
      lenisRef.current = lenis;

      const raf = (time: number) => {
        lenis?.raf(time);
        frame = requestAnimationFrame(raf);
      };
      frame = requestAnimationFrame(raf);
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      lenis?.destroy();
      lenisRef.current = null;
    };
  }, []);

  const closePlan = useCallback(() => setActivePlan(null), []);

  useEffect(() => {
    if (!activePlan) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    const body = document.body;
    const root = document.documentElement;

    lenisRef.current?.stop();
    body.style.overflow = "hidden";
    root.classList.add("has-dialog");

    const panel = dialogRef.current;
    const getFocusable = () =>
      Array.from(
        panel?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
        ) ?? []
      ).filter((element) => element.offsetParent !== null);

    getFocusable()[0]?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setActivePlan(null);
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

    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      body.style.overflow = "";
      root.classList.remove("has-dialog");
      lenisRef.current?.start();
      previouslyFocused?.focus();
    };
  }, [activePlan]);

  useEffect(() => {
    if (!menuOpen) return;

    const body = document.body;
    body.style.overflow = "hidden";

    const panel = menuRef.current;
    const getFocusable = () =>
      Array.from(
        panel?.querySelectorAll<HTMLElement>('a[href], button:not([disabled])') ?? []
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

  useEffect(() => {
    const root = document.querySelector<HTMLElement>(".shipin");
    if (!root) return;
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const onScroll = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      root.style.setProperty("--sp", String(max > 0 ? window.scrollY / max : 0));
      root.style.setProperty("--sy", String(window.scrollY));
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });

    let io: IntersectionObserver | undefined;
    if (!calm) {
      const observer = new IntersectionObserver(
        (entries) =>
          entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            entry.target.classList.add("is-in");
            observer.unobserve(entry.target);
          }),
        { threshold: 0.12 }
      );
      io = observer;
      root
        .querySelectorAll(
          ".section-head, .steps, .proof__inner, .network__grid, .pricing__grid, .faq__grid, .cta__panel"
        )
        .forEach((el) => {
          el.classList.add("js-reveal");
          observer.observe(el);
        });
    }

    let last: HTMLElement | null = null;
    const resetTilt = (el: HTMLElement | null) => {
      el?.style.setProperty("--tx", "0deg");
      el?.style.setProperty("--ty", "0deg");
    };
    const onMove = (event: PointerEvent) => {
      if (!calm) {
        root.style.setProperty("--px", String(event.clientX / window.innerWidth - 0.5));
        root.style.setProperty("--py", String(event.clientY / window.innerHeight - 0.5));
      }
      const card = (event.target as HTMLElement).closest<HTMLElement>(
        ".step, .plan, .metric, .telemetry"
      );
      if (card !== last) {
        resetTilt(last);
        last = card;
      }
      if (!card) return;
      const box = card.getBoundingClientRect();
      const x = (event.clientX - box.left) / box.width;
      const y = (event.clientY - box.top) / box.height;
      card.style.setProperty("--mx", `${x * 100}%`);
      card.style.setProperty("--my", `${y * 100}%`);
      if (!calm) {
        card.style.setProperty("--tx", `${((0.5 - y) * 7).toFixed(2)}deg`);
        card.style.setProperty("--ty", `${((x - 0.5) * 7).toFixed(2)}deg`);
      }
    };
    root.addEventListener("pointermove", onMove);

    return () => {
      window.removeEventListener("scroll", onScroll);
      root.removeEventListener("pointermove", onMove);
      io?.disconnect();
    };
  }, []);

  const requestHref = (planId: PlanId) => {
    const target = `/requests/new?plan=${planId}`;
    return loggedIn ? target : `/login?next=${encodeURIComponent(target)}`;
  };

  const closeMenu = () => setMenuOpen(false);

  return (
    <div className={`shipin ${display.variable}`}>
      <a className="skip-link" href="#main">
        Skip to content
      </a>

      <header className="site-header">
        <div className="shell site-header__inner">
          <Link href="/" className="brand" aria-label="ShipIN home">
            <span className="brand__mark" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none">
                <rect x="1.5" y="1.5" width="21" height="21" rx="5" fill="currentColor" />
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
              <span className={menuOpen ? "menu-button__bars is-open" : "menu-button__bars"} aria-hidden="true">
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
            <Link href={accountHref} className="btn btn--ghost" onClick={closeMenu}>
              {accountLabel}
            </Link>
            <Link href={startHref} className="btn btn--primary" onClick={closeMenu}>
              Start a request
              <ArrowUpRight />
            </Link>
            <p className="mono-note">Mumbai hub · Replies within one business day</p>
          </div>
        </div>
      )}

      <main id="main">
        <section className="hero">
          <div className="scene" aria-hidden="true">
            <span className="scene__ring" />
            <span className="scene__ring scene__ring--b" />
            <div className="scene__card scene__card--a">
              <div className="scene__k">Manifest SH-2048 <i>In transit</i></div>
              <strong>Mumbai → Berlin</strong>
              <small>ETA 20 Oct · Frankfurt handoff</small>
              <div className="scene__bar" />
            </div>
            <div className="scene__card scene__card--b">
              <div className="scene__k">Checked at hub <i>QA</i></div>
              <strong>4 of 4 units matched</strong>
              <div className="hub">
                <div className="hub__ring">
                  <svg viewBox="0 0 52 52">
                    <defs>
                      <linearGradient id="hub-grad" x1="0" y1="0" x2="1" y2="1">
                        <stop offset="0" stopColor="#ffc23d" />
                        <stop offset="1" stopColor="#ff3d6e" />
                      </linearGradient>
                    </defs>
                    <circle className="hub__track" cx="26" cy="26" r="18" />
                    <circle className="hub__arc" cx="26" cy="26" r="18" />
                  </svg>
                  <span className="hub__num" />
                </div>
                <ul className="hub__list">
                  <li><span className="hub__tick"><svg viewBox="0 0 10 10"><path d="M2 5.2l2 2L8 3" pathLength={1} /></svg></span>Item count</li>
                  <li><span className="hub__tick"><svg viewBox="0 0 10 10"><path d="M2 5.2l2 2L8 3" pathLength={1} /></svg></span>Condition</li>
                  <li><span className="hub__tick"><svg viewBox="0 0 10 10"><path d="M2 5.2l2 2L8 3" pathLength={1} /></svg></span>Photos taken</li>
                </ul>
              </div>
            </div>
            <div className="scene__card scene__card--c">
              <div className="scene__k">Export cleared</div>
              <strong>Duties prepaid</strong>
              <small>15 Oct, 11:20 · Mumbai</small>
            </div>
            <div className="scene__card scene__card--d">
              <div className="scene__k">Freight saved</div>
              <span className="scene__big">40%</span>
              <small>after consolidation</small>
            </div>
          </div>
          <div className="shell">
            <div className="hero__split">
              <div className="hero__text">
                <h1 className="hero__title">
                  <span className="hero__line">
                    <span>Buy from India.</span>
                  </span>
                  <span className="hero__line">
                    <span>
                      Deliver <em>anywhere.</em>
                    </span>
                  </span>
                </h1>

                <p className="hero__lede">
                  ShipIN buys on your behalf from any Indian store, inspects what
                  arrives, packs it into one manifest, and forwards it to your
                  address. You send a link. We handle the rest.
                </p>

                <a href="#platform" className="text-link text-link--arrow hero__more">
                  See how the pipeline runs
                  <span aria-hidden="true">↓</span>
                </a>

                <p className="mono-note hero__note">
                  No account needed for a quote · Average reply in 1 business day
                </p>
              </div>

              <div className="globe-panel">
                <div className="globe-panel__bar">
                  <span className="status">
                    <span className="status__dot" aria-hidden="true" />
                    Live network
                  </span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={globeMotion}
                    aria-label="Globe animation"
                    className="motion-toggle globe-switch"
                    onClick={() => setGlobeMotion((on) => !on)}
                  >
                    <span>Animation</span>
                    <span className="globe-switch__track" aria-hidden="true">
                      <span className="globe-switch__thumb" />
                    </span>
                  </button>
                </div>
                <div className="globe-panel__canvas">
                  <GlobeDashboard
                    darkMode={true}
                    bgColor="#0c0a09"
                    motionEnabled={globeMotion}
                    showMotionToggle={false}
                  />
                </div>
              </div>
            </div>

            <dl className="hero__stats">
              <div className="stat">
                <dt className="stat__label">Corridors</dt>
                <dd className="stat__value">42</dd>
              </div>
              <div className="stat">
                <dt className="stat__label">Median transit</dt>
                <dd className="stat__value">6.2d</dd>
              </div>
              <div className="stat">
                <dt className="stat__label">Freight saved</dt>
                <dd className="stat__value">40%</dd>
              </div>
              <div className="stat">
                <dt className="stat__label">Manifest accuracy</dt>
                <dd className="stat__value">99.2%</dd>
              </div>
            </dl>
          </div>

          <div className="market-strip" aria-label="Destinations we ship to">
            <div className="market-strip__track">
              {[...marketTicker, ...marketTicker].map((market, index) => (
                <span className="market-strip__item" key={`${market}-${index}`} aria-hidden={index >= marketTicker.length}>
                  {market}
                </span>
              ))}
            </div>
          </div>
        </section>

        <section className="section" id="platform">
          <div className="shell">
            <div className="section-head">
              <div>
                <p className="eyebrow">01 / The pipeline</p>
                <h2>One request. Four checkpoints.</h2>
              </div>
              <p className="lede">
                You do not need a seller, a freight desk and a customs broker on
                separate threads. The same team owns the parcel from checkout to
                doorstep.
              </p>
            </div>

            <ol className="steps">
              {steps.map((step) => (
                <li className="step" key={step.number}>
                  <span className="step__number">{step.number}</span>
                  <h3>{step.title}</h3>
                  <p>{step.body}</p>
                  <span className="step__meta">{step.meta}</span>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="proof">
          <div className="shell proof__inner">
            <div className="proof__statement">
              <p className="eyebrow">Track record</p>
              <h2>One accountable partner, from checkout to customs.</h2>
              <p>
                Most cross border orders fail in the handoffs. ShipIN keeps
                purchasing, warehousing, export filing and delivery inside one
                operating team, so a missing parcel has one place to go.
              </p>
            </div>

            <div className="proof__grid">
              {metrics.map((metric) => (
                <div className="metric" key={metric.label}>
                  <span className="metric__value">{metric.value}</span>
                  <span className="metric__label">{metric.label}</span>
                  <p className="metric__detail">{metric.detail}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="network" id="network">
          <div className="shell">
            <div className="section-head section-head--dark">
              <div>
                <p className="eyebrow">02 / Live network</p>
                <h2>The route is visible while it happens.</h2>
              </div>
              <p className="lede">
                Every request gets a manifest ID and an event log. Watch the
                parcel move from the seller&apos;s counter to your address without
                emailing an account manager for an update.
              </p>
            </div>

            <div className="network__grid">
              <div className="corridors">
                <table className="corridors__table">
                  <caption className="sr-only">
                    Active shipping corridors from Mumbai
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Corridor</th>
                      <th scope="col">Transit</th>
                      <th scope="col">Cut off</th>
                    </tr>
                  </thead>
                  <tbody>
                    {corridors.map((corridor) => (
                      <tr key={corridor.route}>
                        <th scope="row" className="corridors__route">
                          {corridor.route}
                        </th>
                        <td>{corridor.transit}</td>
                        <td className="corridors__cutoff">{corridor.cutoff}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="corridors__note">
                  Transit excludes customs holds. Freight is quoted per
                  consolidated manifest, not per parcel.
                </p>
              </div>

              <div className="telemetry">
                <div className="telemetry__head">
                  <div>
                    <span className="micro-label">Manifest</span>
                    <strong className="telemetry__id">SH-2048</strong>
                  </div>
                  <span className="chip chip--rust">In transit</span>
                </div>

                <div className="telemetry__route">
                  <div>
                    <span className="micro-label">From</span>
                    <strong>Mumbai</strong>
                  </div>
                  <span className="telemetry__arrow" aria-hidden="true">
                    →
                  </span>
                  <div>
                    <span className="micro-label">To</span>
                    <strong>Berlin</strong>
                  </div>
                  <span className="telemetry__eta">ETA 20 Oct</span>
                </div>

                <ol className="timeline">
                  <li className="timeline__item timeline__item--done">
                    <span className="timeline__dot" aria-hidden="true" />
                    <div>
                      <p className="timeline__title">Seller pickup</p>
                      <p className="timeline__meta">12 Oct, 09:40 · Jaipur</p>
                    </div>
                  </li>
                  <li className="timeline__item timeline__item--done">
                    <span className="timeline__dot" aria-hidden="true" />
                    <div>
                      <p className="timeline__title">Checked at hub</p>
                      <p className="timeline__meta">14 Oct, 16:05 · Mumbai</p>
                      <p className="timeline__detail">
                        4 of 4 units matched. Photo set attached.
                      </p>
                    </div>
                  </li>
                  <li className="timeline__item timeline__item--done">
                    <span className="timeline__dot" aria-hidden="true" />
                    <div>
                      <p className="timeline__title">Export cleared</p>
                      <p className="timeline__meta">15 Oct, 11:20 · Mumbai</p>
                    </div>
                  </li>
                  <li className="timeline__item timeline__item--current">
                    <span className="timeline__dot" aria-hidden="true" />
                    <div>
                      <p className="timeline__title">In transit</p>
                      <p className="timeline__meta">17 Oct, 22:10 · Frankfurt</p>
                      <p className="timeline__detail">
                        Handed to the last mile partner. Duties prepaid.
                      </p>
                    </div>
                  </li>
                  <li className="timeline__item timeline__item--next">
                    <span className="timeline__dot" aria-hidden="true" />
                    <div>
                      <p className="timeline__title">Delivery</p>
                      <p className="timeline__meta">Expected 20 Oct · Berlin</p>
                    </div>
                  </li>
                </ol>

                <p className="telemetry__foot">
                  <span>Sample manifest</span>
                  <span>Updated 12s ago</span>
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="section pricing" id="pricing">
          <div className="shell">
            <div className="section-head">
              <div>
                <p className="eyebrow">03 / Access</p>
                <h2>Pricing that follows the work.</h2>
              </div>
              <p className="lede">
                No subscription. Pay per request for small batches, or move to
                freight rates once volume justifies a lane.
              </p>
            </div>

            <div className="pricing__grid">
              {plans.map((plan) => (
                <article
                  key={plan.id}
                  className={plan.featured ? "plan plan--featured" : "plan"}
                >
                  <div className="plan__head">
                    <span className="plan__code">{plan.code}</span>
                    {plan.featured && (
                      <span className="chip chip--outline">Most chosen</span>
                    )}
                  </div>
                  <h3 className="plan__name">{plan.name}</h3>
                  <p className="plan__price">
                    {plan.price}
                    <span>{plan.unit}</span>
                  </p>
                  <p className="plan__description">{plan.description}</p>

                  <ul className="plan__features">
                    {plan.features.map((feature) => (
                      <li key={feature}>
                        <span className="plan__check" aria-hidden="true">
                          <Check />
                        </span>
                        {feature}
                      </li>
                    ))}
                  </ul>

                  <button
                    type="button"
                    className={
                      plan.featured
                        ? "btn btn--accent plan__cta"
                        : "btn btn--ghost plan__cta"
                    }
                    onClick={() => setActivePlan(plan)}
                  >
                    {plan.cta}
                  </button>
                </article>
              ))}
            </div>

            <div className="pricing__note">
              <span>Duties, taxes and freight are quoted before you approve.</span>
              <span>Cancel free before procurement starts.</span>
            </div>
          </div>
        </section>

        <section className="section faq" id="faq">
          <div className="shell faq__grid">
            <div className="faq__intro">
              <p className="eyebrow">04 / Details</p>
              <h2 className="faq__title">Questions buyers ask first.</h2>
              <p className="faq__lede">
                Still unsure about a seller or a restricted item? Send the link
                and we will tell you before you commit.
              </p>
              <Link href={startHref} className="text-link text-link--arrow">
                Ask about your first order
                <ArrowUpRight />
              </Link>
            </div>

            <div className="faq__list">
              {faqs.map((faq) => (
                <details key={faq.question}>
                  <summary>{faq.question}</summary>
                  <p>{faq.answer}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="cta">
          <div className="shell">
            <div className="cta__panel">
              <div>
                <h2>Send the link. We handle the rest.</h2>
                <p>
                  Start with one order, then add stores, SKUs and delivery
                  addresses as you grow.
                </p>
              </div>
              <div className="cta__action">
                <Link href={startHref} className="btn btn--ink">
                  Start a request
                  <ArrowUpRight />
                </Link>
                <p className="mono-note cta__note">
                  No account needed for a quote
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <div className="shell">
          <div className="footer__grid">
            <div className="footer__brand">
              <Link href="/" className="brand brand--light" aria-label="ShipIN home">
                <span className="brand__mark" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none">
                    <rect x="1.5" y="1.5" width="21" height="21" rx="5" fill="currentColor" />
                    <path
                      d="M7 14.5h8.5M12 10.5l4 4-4 4"
                      stroke="var(--ink)"
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
              <p>
                Procurement, warehousing and freight from India, run by one team
                in Mumbai.
              </p>
              <p className="footer__address">
                Andheri East, Mumbai 400069 · Mon to Sat, 09:00 to 19:00 IST
              </p>
            </div>

            <div className="footer__col">
              <h2>Platform</h2>
              <ul>
                <li>
                  <a href="#platform">Pipeline</a>
                </li>
                <li>
                  <a href="#network">Network</a>
                </li>
                <li>
                  <a href="#pricing">Pricing</a>
                </li>
                <li>
                  <a href="#faq">FAQ</a>
                </li>
              </ul>
            </div>

            <div className="footer__col">
              <h2>Account</h2>
              <ul>
                <li>
                  <Link href={accountHref}>{accountLabel}</Link>
                </li>
                <li>
                  <Link href={startHref}>New request</Link>
                </li>
                <li>
                  <a href="mailto:hello@shipin.co">hello@shipin.co</a>
                </li>
              </ul>
            </div>
          </div>

          <div className="footer__base">
            <span>© 2026 ShipIN Logistics</span>
            <span className="status status--footer">
              <span className="status__dot" aria-hidden="true" />
              All corridors operational
            </span>
            <span>Designed and run in Mumbai</span>
          </div>
        </div>
      </footer>

      {activePlan && (
        <div
          className="plan-dialog"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closePlan();
          }}
        >
          <div
            ref={dialogRef}
            className="plan-dialog__panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="plan-dialog-title"
          >
            <div className="plan-dialog__head">
              <div>
                <span className="micro-label">{activePlan.code}</span>
                <h2 id="plan-dialog-title" className="plan-dialog__title">
                  {activePlan.name}
                </h2>
              </div>
              <button
                type="button"
                className="plan-dialog__close"
                onClick={closePlan}
                aria-label="Close plan details"
              >
                <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
                  <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" />
                </svg>
              </button>
            </div>

            <p className="plan-dialog__price">
              {activePlan.price}
              <span>{activePlan.unit}</span>
            </p>
            <p className="plan-dialog__description">{activePlan.description}</p>

            <ul className="plan-dialog__features">
              {activePlan.features.map((feature) => (
                <li key={feature}>
                  <span aria-hidden="true">
                    <Check />
                  </span>
                  {feature}
                </li>
              ))}
            </ul>

            <div className="plan-dialog__actions">
              <Link
                href={requestHref(activePlan.id)}
                className="btn btn--primary plan-dialog__cta"
                onClick={closePlan}
              >
                Continue with {activePlan.name}
                <ArrowUpRight />
              </Link>
              <button type="button" className="text-link" onClick={closePlan}>
                Compare tiers again
              </button>
            </div>
            <p className="mono-note plan-dialog__note">
              Nothing is charged until you approve the quote.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}