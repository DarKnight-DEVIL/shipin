"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
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
    loading: () => <div className="w-full h-full min-h-[480px] bg-transparent" />
  }
);

export default function Home() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [activeModalPlan, setActiveModalPlan] = useState<string | null>(null);
  const [isMounted, setIsMounted] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const lastFocusedRef = useRef<HTMLElement | null>(null);
  const lenisRef = useRef<Lenis | null>(null);

  useEffect(() => {
    setIsMounted(true);
    return onAuthStateChanged(auth, (user) => setLoggedIn(!!user));
  }, []);

  useEffect(() => {
    const body = document.body;
    if (activeModalPlan) {
      lenisRef.current?.stop();
      body.style.overflow = "hidden";
    } else {
      lenisRef.current?.start();
      body.style.overflow = "";
    }
    return () => {
      lenisRef.current?.start();
      body.style.overflow = "";
    };
  }, [activeModalPlan]);

  useEffect(() => {
    if (!activeModalPlan) return;

    lastFocusedRef.current = document.activeElement as HTMLElement | null;
    const node = containerRef.current;
    node?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setActiveModalPlan(null);
        return;
      }
      if (event.key !== "Tab" || !node) return;
      const focusables = node.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      lastFocusedRef.current?.focus();
    };
  }, [activeModalPlan]);

  const startHref = loggedIn
    ? "/requests/new"
    : "/login?next=/requests/new";

  const handleTicketKeyDown = (plan: string) => (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" || event.key === " " || event.key === "Spacebar") {
      event.preventDefault();
      setActiveModalPlan(plan);
    }
  };

  useEffect(() => {
    if (!isMounted) return;
    let isCancelled = false;

    let revertAnimations: (() => void) | null = null;
    let stopSmoothScroll: (() => void) | null = null;

    Promise.all([import("gsap"), import("gsap/ScrollTrigger")])
      .then(([gsapMod, ScrollTriggerMod]) => {
        if (isCancelled) return;
        const gsap = gsapMod.default;
        const ScrollTrigger = ScrollTriggerMod.default;
        gsap.registerPlugin(ScrollTrigger);

        const mm = gsap.matchMedia();

        mm.add("(prefers-reduced-motion: reduce)", () => {
          gsap.set(
            ["#header", ".hero__title", ".hero__subtitle", ".hero__ctas", ".hero__globe",
              ".section__label", ".section__title", ".section__desc",
              ".product-card", ".expand-section", ".ticket"],
            { opacity: 1, clearProps: "transform" }
          );
        });

        mm.add("(prefers-reduced-motion: no-preference)", () => {
          gsap.fromTo("#header", { opacity: 0, y: -20 }, { opacity: 1, y: 0, duration: 0.5, ease: "power3.out" });
          gsap.fromTo(".hero__title", { opacity: 0, y: 15 }, { opacity: 1, y: 0, duration: 0.6, ease: "power3.out" });
          gsap.fromTo(".hero__subtitle", { opacity: 0, y: 15 }, { opacity: 1, y: 0, duration: 0.6, ease: "power3.out", delay: 0.1 });
          gsap.fromTo(".hero__ctas", { opacity: 0, y: 15 }, { opacity: 1, y: 0, duration: 0.6, ease: "power3.out", delay: 0.2 });
          gsap.fromTo(
            ".hero__globe",
            { opacity: 0, y: 20, scale: 0.98 },
            { opacity: 1, y: 0, scale: 1, duration: 0.8, ease: "power3.out", delay: 0.1, clearProps: "transform" }
          );

          gsap.utils.toArray<HTMLElement>(".section__label, .section__title, .section__desc").forEach((el) => {
            gsap.fromTo(el, { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.5, ease: "power3.out", scrollTrigger: { trigger: el, start: "top 90%", once: true } });
          });

          ScrollTrigger.batch(".product-card", {
            onEnter: (elements) => {
              gsap.fromTo(elements, { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.5, stagger: 0.08, ease: "power3.out", clearProps: "transform" });
            },
            start: "top 90%",
            once: true
          });

          ScrollTrigger.batch(".expand-section", {
            onEnter: (elements) => {
              gsap.fromTo(elements, { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.5, ease: "power3.out", clearProps: "transform" });
            },
            start: "top 90%",
            once: true
          });

          ScrollTrigger.batch(".ticket", {
            onEnter: (elements) => {
              gsap.fromTo(elements, { opacity: 0, y: 30, rotateX: -3 }, { opacity: 1, y: 0, rotateX: 0, duration: 0.5, stagger: 0.08, ease: "power3.out", clearProps: "transform" });
            },
            start: "top 90%",
            once: true
          });
        });

        import("lenis")
          .then(({ default: Lenis }) => {
            if (isCancelled) return;
            const lenis = new Lenis({
              duration: 1.1,
              smoothWheel: true,
              anchors: { offset: 112 },
              stopInertiaOnNavigate: true,
            });
            lenisRef.current = lenis;

            lenis.on("scroll", ScrollTrigger.update);
            const onTick = (time: number) => lenis.raf(time * 1000);
            gsap.ticker.add(onTick);
            gsap.ticker.lagSmoothing(0);

            stopSmoothScroll = () => {
              gsap.ticker.remove(onTick);
              lenis.destroy();
              lenisRef.current = null;
            };
          })
          .catch(() => {});

        revertAnimations = () => mm.revert();
      })
      .catch(() => {
        document.documentElement.classList.add("anim-failed");
      });

    const tickets = document.querySelectorAll(".ticket[data-ticket]");
    const cleanupListeners: (() => void)[] = [];

    tickets.forEach((ticketEl) => {
      const ticket = ticketEl as HTMLElement;
      let rafId: number | null = null;
      const onMouseMove = (e: MouseEvent) => {
        if (rafId) return;
        rafId = requestAnimationFrame(() => {
          const rect = ticket.getBoundingClientRect();
          const x = (e.clientX - rect.left) / rect.width;
          const y = (e.clientY - rect.top) / rect.height;
          ticket.style.transform = `perspective(800px) rotateX(${(y - 0.5) * -12}deg) rotateY(${(x - 0.5) * 12}deg) translateY(-4px)`;
          ticket.style.setProperty("--sheen-x", `${x * 100}%`);
          ticket.style.setProperty("--sheen-y", `${y * 100}%`);
          rafId = null;
        });
      };
      const onMouseLeave = () => {
        if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
        ticket.style.transform = "";
      };

      ticket.addEventListener("mousemove", onMouseMove as EventListener);
      ticket.addEventListener("mouseleave", onMouseLeave);
      cleanupListeners.push(() => {
        ticket.removeEventListener("mousemove", onMouseMove as EventListener);
        ticket.removeEventListener("mouseleave", onMouseLeave);
      });
    });

    const expandRows = document.querySelectorAll("[data-expand]");
    const expandCleanups: (() => void)[] = [];
    expandRows.forEach((rowEl) => {
      const row = rowEl as HTMLElement;
      const btn = row.querySelector(".expand-row__header");
      const onClick = () => {
        const isOpen = row.classList.contains("is-open");
        row.parentElement?.querySelectorAll(".expand-row.is-open").forEach((r) => r.classList.remove("is-open"));
        if (!isOpen) row.classList.add("is-open");
      };
      btn?.addEventListener("click", onClick);
      expandCleanups.push(() => btn?.removeEventListener("click", onClick));
    });

    const barcodePatterns = [
      [3, 1, 2, 1, 3, 1, 1, 2, 3, 1, 2, 1, 3, 1, 2, 3, 1, 1, 2, 1, 3, 2, 1, 1, 3, 1, 2, 3, 1, 2, 1, 1, 3, 2],
      [2, 1, 3, 2, 1, 1, 2, 3, 1, 2, 1, 3, 2, 1, 1, 3, 2, 1, 2, 3, 1, 1, 3, 2, 1, 2, 1, 3, 2, 1, 1, 3, 2, 1],
      [1, 2, 1, 3, 2, 1, 3, 1, 2, 3, 1, 2, 1, 3, 2, 1, 2, 3, 1, 1, 3, 2, 1, 3, 2, 1, 1, 2, 3, 2, 1, 3, 2, 1],
      [3, 2, 1, 1, 3, 2, 1, 2, 3, 1, 2, 1, 3, 2, 1, 1, 3, 2, 3, 1, 2, 1, 3, 2, 1, 1, 3, 2, 1, 2, 3, 1, 2, 3]
    ];
    document.querySelectorAll(".ticket__barcode").forEach((bc, i) => {
      bc.innerHTML = "";
      const pattern = barcodePatterns[i % barcodePatterns.length];
      pattern.forEach((w) => {
        const line = document.createElement("div");
        line.className = "ticket__barcode-line";
        line.style.width = `${w}px`;
        bc.appendChild(line);
      });
    });

    return () => {
      isCancelled = true;
      stopSmoothScroll?.();
      revertAnimations?.();
      cleanupListeners.forEach((fn) => fn());
      expandCleanups.forEach((fn) => fn());
    };
  }, [isMounted]);

  const planDataMap: Record<string, any> = {
    explorer: { badge: "Default", title: "Explorer Pass", subtitle: "A clear, flexible way to get your order moving.", price: "$0", unit: "per order", features: ["Standard purchasing & inspection.", "Maximum 3 items (SKUs).", "Maximum 2 different Indian stores."] },
    express: { badge: "Priority", title: "Express Pass", subtitle: "Move faster with priority handling and consolidation.", price: "$9", unit: "per order", features: ["Priority purchasing (queue jump).", "Detailed inspection with photos.", "Multi-store consolidation (up to 5 stores).", "Maximum 10 items (SKUs).", "Up to 30 days of warehouse storage."] },
    merchant: { badge: "Bulk", title: "Merchant Pass", subtitle: "A tailored workflow for resellers and larger hauls.", price: "Custom", unit: "tailored quote", features: ["Unlimited items and stores.", "Custom shipping rates for heavy/bulk freight.", "Dedicated procurement assistant."] }
  };

  const activePlanDetails = activeModalPlan ? planDataMap[activeModalPlan] : null;

  return (
    <main className="landing-page-root">
      <noscript>
        <style>{`
          .landing-page-root .header,
          .landing-page-root .hero__title,
          .landing-page-root .hero__subtitle,
          .landing-page-root .hero__ctas,
          .landing-page-root .hero__globe { opacity: 1 !important; transform: none !important; }
        `}</style>
      </noscript>

      {/* HEADER */}
      <header className="header" id="header">
        <Link href="/" className="header__brand">
          <div className="header__logo">S</div>
          <span className="header__name">ShipIN</span>
        </Link>
        <nav className="header__nav">
          <a href="#features" className="header__link">Features</a>
          <a href="#how-it-works" className="header__link">How It Works</a>
          <a href="#pricing" className="header__link">Pricing</a>
          <a href="#faq" className="header__link">FAQ</a>
        </nav>
        <div className="header__meta">
          <Link href="/login" className="header__login">
            {loggedIn ? "Dashboard" : "Login"}
          </Link>
          <Link href={startHref} className="header__pill">
            <span>Get Started</span>
          </Link>
          <button className="header__mobile-menu" aria-label="Menu">
            <span />
            <span />
            <span />
          </button>
        </div>
      </header>

      <div className={`page-content ${activeModalPlan ? "is-blurred" : ""}`}>
        {/* HERO SECTION */}
        <section className="hero" id="hero">
          <div className="hero__grid">
            <div className="hero__content">
              <h1 className="hero__title">Ship Anything<br />From India</h1>
              <p className="hero__subtitle">
                The B2C SaaS platform that lets anyone in the world purchase Indian products
                and have them delivered to their doorstep. Seamless, transparent, reliable.
              </p>
              <div className="hero__ctas">
                <Link href={startHref} className="hero__cta-primary">
                  <span>Start Shipping &rarr;</span>
                </Link>
                <a href="#how-it-works" className="hero__cta-secondary">See How It Works</a>
              </div>
            </div>
            <div className="hero__globe">
              <GlobeDashboard
                darkMode={false}
                bgColor="transparent"
              />
            </div>
          </div>
        </section>

        {/* MARQUEE */}
        <div className="marquee-band" id="marquee">
          <div className="marquee-band__track">
            <div className="marquee-band__group">
              {["Purchase", "Warehouse", "Pack", "Consolidate", "Ship", "Track", "Deliver", "Support"].map((item, idx) => (
                <div key={idx} className="marquee-band__item">
                  <span className="marquee-band__dot" />
                  <span className="marquee-band__text">{item}</span>
                </div>
              ))}
              {["Purchase", "Warehouse", "Pack", "Consolidate", "Ship", "Track", "Deliver", "Support"].map((item, idx) => (
                <div key={`dup-${idx}`} className="marquee-band__item">
                  <span className="marquee-band__dot" />
                  <span className="marquee-band__text">{item}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* FEATURES */}
        <section className="section" id="features">
          <h2 className="section__title">Everything You Need,<br />Nothing You Don't</h2>
          <p className="section__desc">From the moment you click "buy" in an Indian store to your doorstep halfway across the world, we handle every link in the chain.</p>
          <div className="product-grid">
            <div className="product-card">
              <div className="product-card__icon"><svg viewBox="0 0 24 24"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg></div>
              <h3 className="product-card__title">Purchase Anything</h3>
              <p className="product-card__desc">From niche websites to major Indian stores - we buy it on your behalf and bring it to our warehouse.</p>
              <span className="product-card__tag">Procurement</span>
            </div>
            <div className="product-card">
              <div className="product-card__icon"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg></div>
              <h3 className="product-card__title">Ship Worldwide</h3>
              <p className="product-card__desc">Reliable international delivery with clear tracking at every step to destinations worldwide.</p>
              <span className="product-card__tag">Global Logistics</span>
            </div>
            <div className="product-card">
              <div className="product-card__icon"><svg viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg></div>
              <h3 className="product-card__title">Secure &amp; Transparent</h3>
              <p className="product-card__desc">Quotes, payments, and support in one place. No hidden surprises, ever.</p>
              <span className="product-card__tag">Trust Layer</span>
            </div>
            <div className="product-card">
              <div className="product-card__icon"><svg viewBox="0 0 24 24"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg></div>
              <h3 className="product-card__title">End-to-End Handling</h3>
              <p className="product-card__desc">Purchase, warehouse, pack, inspect, and ship - everything handled by the ShipIN team.</p>
              <span className="product-card__tag">Full Stack</span>
            </div>
            <div className="product-card">
              <div className="product-card__icon"><svg viewBox="0 0 24 24"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg></div>
              <h3 className="product-card__title">Live Tracking</h3>
              <p className="product-card__desc">Real-time updates from pickup to delivery. Know exactly where your package is, always.</p>
              <span className="product-card__tag">Visibility</span>
            </div>
            <div className="product-card">
              <div className="product-card__icon"><svg viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg></div>
              <h3 className="product-card__title">24/7 Support</h3>
              <p className="product-card__desc">Dedicated team available round the clock. Real people, real answers, zero bots.</p>
              <span className="product-card__tag">Human</span>
            </div>
          </div>
        </section>

        {/* HOW IT WORKS */}
        <section className="section" id="how-it-works">
          <h2 className="section__title">Three Steps.<br />Zero Hassle.</h2>
          <p className="section__desc">What looks like magic is just a clean system. Here's the flow.</p>
          <div className="expand-section">
            <h3 className="expand-section__title">How It Works</h3>
            <div className="expand-row" data-expand>
              <button className="expand-row__header">
                <span className="expand-row__question">01 - Create a Request</span>
                <span className="expand-row__chevron"><svg viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg></span>
              </button>
              <div className="expand-row__body">
                <p className="expand-row__answer">Paste the product link from any Indian e-commerce store. Tell us your quantity, preferred shipping method, and your delivery address. Our system ingests the request and starts the procurement pipeline automatically.</p>
              </div>
            </div>
            <div className="expand-row" data-expand>
              <button className="expand-row__header">
                <span className="expand-row__question">02 - Approve the Quote</span>
                <span className="expand-row__chevron"><svg viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg></span>
              </button>
              <div className="expand-row__body">
                <p className="expand-row__answer">We'll share a transparent quote covering product cost, domestic Indian transport, international shipping, and our service fee. Pay securely through our integrated payment system. No surprises, no hidden charges.</p>
              </div>
            </div>
            <div className="expand-row" data-expand>
              <button className="expand-row__header">
                <span className="expand-row__question">03 - We Ship It to You</span>
                <span className="expand-row__chevron"><svg viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg></span>
              </button>
              <div className="expand-row__body">
                <p className="expand-row__answer">Your item arrives at our Indian warehouse. We inspect, pack, and ship it internationally. Track every step in real-time. Estimated delivery: 7 to 14 business days depending on destination.</p>
              </div>
            </div>
            <div className="expand-row" data-expand>
              <button className="expand-row__header">
                <span className="expand-row__question">04 - Consolidation (Optional)</span>
                <span className="expand-row__chevron"><svg viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg></span>
              </button>
              <div className="expand-row__body">
                <p className="expand-row__answer">Have multiple purchases? We combine them into a single shipment, reducing your total shipping cost by up to 40%. Simply select "consolidate" in your dashboard.</p>
              </div>
            </div>
          </div>
        </section>

        {/* PRICING TICKETS */}
        <section className="tickets-section" id="pricing">
          <div className="tickets-section__header">
            <h2 className="section__title">Choose Your Pass</h2>
            <p className="section__desc" style={{ margin: "0 auto 0" }}>Pay per order. No monthly commitments.</p>
          </div>
          <div className="tickets-grid">
            <div
              className="ticket"
              data-ticket
              data-plan="explorer"
              role="button"
              tabIndex={0}
              aria-haspopup="dialog"
              onClick={() => setActiveModalPlan("explorer")}
              onKeyDown={handleTicketKeyDown("explorer")}
            >
              <div className="ticket__sheen" /><div className="ticket__perforation" /><div className="ticket__notch-left" /><div className="ticket__notch-right" /><div className="ticket__tear-line" />
              <div className="ticket__content">
                <div className="ticket__main">
                  <div className="ticket__topline"><span className="ticket__access">EARLY ACCESS</span><span className="ticket__number">NO. 001</span></div>
                  <h3 className="ticket__title">Explorer Pass</h3>
                  <p className="ticket__subtitle">For standard, simple orders. A reliable way to purchase and ship from India.</p>
                </div>
                <div className="ticket__side">
                  <div><div className="ticket__price">$0</div><span className="ticket__price-unit">per order</span></div>
                  <div><div className="ticket__barcode" /><div className="ticket__code">EX-2026</div></div>
                </div>
              </div>
            </div>

            <div
              className="ticket"
              data-ticket
              data-plan="express"
              role="button"
              tabIndex={0}
              aria-haspopup="dialog"
              onClick={() => setActiveModalPlan("express")}
              onKeyDown={handleTicketKeyDown("express")}
            >
              <div className="ticket__sheen" /><div className="ticket__perforation" /><div className="ticket__notch-left" /><div className="ticket__notch-right" /><div className="ticket__tear-line" />
              <div className="ticket__content">
                <div className="ticket__main">
                  <div className="ticket__topline"><span className="ticket__access">PRIORITY ACCESS</span><span className="ticket__number">NO. 002</span></div>
                  <h3 className="ticket__title">Express Pass</h3>
                  <p className="ticket__subtitle">For multi-store consolidation &amp; speed. Put your order at the front of the queue.</p>
                </div>
                <div className="ticket__side">
                  <div><div className="ticket__price">$9</div><span className="ticket__price-unit">per order</span></div>
                  <div><div className="ticket__barcode" /><div className="ticket__code">EX-2026</div></div>
                </div>
              </div>
            </div>

            <div
              className="ticket"
              data-ticket
              data-plan="merchant"
              role="button"
              tabIndex={0}
              aria-haspopup="dialog"
              onClick={() => setActiveModalPlan("merchant")}
              onKeyDown={handleTicketKeyDown("merchant")}
            >
              <div className="ticket__sheen" /><div className="ticket__perforation" /><div className="ticket__notch-left" /><div className="ticket__notch-right" /><div className="ticket__tear-line" />
              <div className="ticket__content">
                <div className="ticket__main">
                  <div className="ticket__topline"><span className="ticket__access">BULK ACCESS</span><span className="ticket__number">NO. 003</span></div>
                  <h3 className="ticket__title">Merchant Pass</h3>
                  <p className="ticket__subtitle">For resellers and massive hauls. Unlock a tailored procurement workflow.</p>
                </div>
                <div className="ticket__side">
                  <div><div className="ticket__price">Custom</div><span className="ticket__price-unit">tailored quote</span></div>
                  <div><div className="ticket__barcode" /><div className="ticket__code">ME-2026</div></div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="section" id="faq">
          <div className="section__label">FAQ</div>
          <h2 className="section__title">Common Questions,<br />Clear Answers</h2>
          <p className="section__desc">Everything you need to know before making your first shipment.</p>
          <div className="expand-section">
            <div className="expand-row" data-expand>
              <button className="expand-row__header"><span className="expand-row__question">What products can I purchase?</span><span className="expand-row__chevron"><svg viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg></span></button>
              <div className="expand-row__body"><p className="expand-row__answer">Almost anything available from Indian e-commerce platforms - electronics, fashion, home goods, artisan crafts, spices, books, automotive parts, and more. We support Amazon India, Flipkart, Meesho, and dozens of other Indian marketplaces.</p></div>
            </div>
            <div className="expand-row" data-expand>
              <button className="expand-row__header"><span className="expand-row__question">How long does shipping take?</span><span className="expand-row__chevron"><svg viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg></span></button>
              <div className="expand-row__body"><p className="expand-row__answer">Standard international shipping takes 7 to 14 business days depending on your destination. Express options are available for select routes. All shipments include real-time tracking.</p></div>
            </div>
            <div className="expand-row" data-expand>
              <button className="expand-row__header"><span className="expand-row__question">Is my payment secure?</span><span className="expand-row__chevron"><svg viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg></span></button>
              <div className="expand-row__body"><p className="expand-row__answer">Absolutely. We use bank-grade encryption and PCI-compliant payment processing. Payments are held in escrow until your order is confirmed.</p></div>
            </div>
            <div className="expand-row" data-expand>
              <button className="expand-row__header"><span className="expand-row__question">What if my package is damaged?</span><span className="expand-row__chevron"><svg viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg></span></button>
              <div className="expand-row__body"><p className="expand-row__answer">We inspect every package before shipping. In the rare event of damage, we offer full replacement or refund - no questions asked. Our insurance covers the full value of your order.</p></div>
            </div>
          </div>
        </section>

        {/* FOOTER */}
        <footer className="footer">
          <div className="footer__big-word">SHIPIN</div>
          <div className="footer__inner">
            <div className="footer__top">
              <div className="footer__brand-block">
                <h3>ShipIN</h3>
                <p>The B2C SaaS platform connecting global shoppers with the best of India. Professional. Innovative. Trustworthy.</p>
              </div>
              <div className="footer__col">
                <h4>Product</h4>
                <ul>
                  <li><a href="#features">Features</a></li>
                  <li><a href="#pricing">Pricing</a></li>
                </ul>
              </div>
              <div className="footer__col">
                <h4>Company</h4>
                <ul>
                  <li><a href="#about">About</a></li>
                </ul>
              </div>
              <div className="footer__col">
                <h4>Support</h4>
                <ul>
                  <li><a href="#faq">Help Center</a></li>
                </ul>
              </div>
            </div>
            <div className="footer__bottom">
              <p className="footer__copy">&copy; 2026 ShipIN Technologies Pvt. Ltd. All rights reserved.</p>
              <p className="footer__disclaimer">ShipIN operates as a procurement and shipping intermediary. Product availability, pricing, and delivery times are subject to change.</p>
            </div>
          </div>
        </footer>
      </div>

      {/* PRICING MODAL OVERLAY */}
      <div className={`modal-overlay ${activeModalPlan ? "is-active" : ""}`} onClick={() => setActiveModalPlan(null)}>
        {activePlanDetails && (
          <div
            className="modal-container"
            role="dialog"
            aria-modal="true"
            aria-labelledby="pass-modal-title"
            tabIndex={-1}
            ref={containerRef}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="modal-close"
              aria-label="Close pass details"
              onClick={() => setActiveModalPlan(null)}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
            <div className="modal-kicker">Pass details</div>
            <div className="modal-header">
              <div>
                <span className="modal-badge">{activePlanDetails.badge}</span>
                <h3 className="modal-title" id="pass-modal-title">{activePlanDetails.title}</h3>
                <p className="modal-subtitle">{activePlanDetails.subtitle}</p>
              </div>
              <div className="modal-price">
                <div className="modal-price__value">{activePlanDetails.price}</div>
                <span className="modal-price__unit">{activePlanDetails.unit}</span>
              </div>
            </div>
            <div className="modal-panel">
              <div className="modal-panel__label">Included with your pass</div>
              <ul className="modal-features">
                {activePlanDetails.features.map((feat: string, idx: number) => (
                  <li key={idx}>{feat}</li>
                ))}
              </ul>
            </div>
            <div className="modal-footer">
              <div className="modal-note">
                <svg viewBox="0 0 24 24"><path d="M12 3l8 4.5v5c0 4.7-3.4 7.7-8 8.5-4.6-.8-8-3.8-8-8.5v-5L12 3z"/><path d="M9 12l2 2 4-4"/></svg>
                <span>Transparent pricing.<br />No monthly commitment.</span>
              </div>
              <button
                className="modal-action"
                onClick={() => {
                  setActiveModalPlan(null);
                  const lenis = lenisRef.current;
                  if (lenis) {
                    lenis.scrollTo("#hero");
                  } else {
                    document.getElementById("hero")?.scrollIntoView({ behavior: "smooth" });
                  }
                }}
              >
                Choose this pass <svg viewBox="0 0 24 24"><path d="M5 12h13"/><path d="M13 6l6 6-6 6"/></svg>
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}