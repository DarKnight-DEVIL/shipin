"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase";
import dynamic from "next/dynamic";

const GlobeDashboard = dynamic(
  () => import("@/components/globe-dashboard/GlobeDashboard"),
  { ssr: false }
);

export default function Home() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [activeModalPlan, setActiveModalPlan] = useState<string | null>(null);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
    return onAuthStateChanged(auth, (user) => setLoggedIn(!!user));
  }, []);

  // Handle background scroll lock when modal is open
  useEffect(() => {
    if (activeModalPlan) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [activeModalPlan]);

  const startHref = loggedIn
    ? "/requests/new"
    : "/login?next=/requests/new";

  // Client-side initialization for GSAP, interactive tilts, and modals
  useEffect(() => {
    if (!isMounted) return;
    let isCancelled = false;

    // ─── GSAP ENTRANCES & SCROLL TRIGGERS ───
    import("gsap").then((gsapMod) => {
      import("gsap/ScrollTrigger").then((ScrollTriggerMod) => {
        if (isCancelled) return;
        const gsap = gsapMod.default;
        const ScrollTrigger = ScrollTriggerMod.default;
        gsap.registerPlugin(ScrollTrigger);

        gsap.fromTo("#header", { opacity: 0, y: -40 }, { opacity: 1, y: 0, duration: 0.8, ease: "power3.out", delay: 0.6 });
        gsap.fromTo(".hero__title", { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 1, ease: "power3.out", delay: 1 });
        gsap.fromTo(".hero__subtitle", { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.7, ease: "power3.out", delay: 1.2 });
        gsap.fromTo(".hero__ctas", { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.7, ease: "power3.out", delay: 1.4 });

        // Globe entrance — fade + rise + slight scale, arriving after the hero copy
        gsap.fromTo(
          ".hero__globe",
          { opacity: 0, y: 40, scale: 0.92 },
          { opacity: 1, y: 0, scale: 1, duration: 1.4, ease: "power3.out", delay: 1.1, clearProps: "transform" }
        );

        gsap.utils.toArray<HTMLElement>(".section__label, .section__title, .section__desc").forEach((el) => {
          gsap.fromTo(el, { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.7, ease: "power3.out", scrollTrigger: { trigger: el, start: "top 85%", once: true } });
        });

        ScrollTrigger.batch(".product-card", {
          onEnter: (elements) => {
            gsap.fromTo(elements, { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 0.6, stagger: 0.1, ease: "power3.out", clearProps: "transform" });
          },
          start: "top 85%",
          once: true
        });

        ScrollTrigger.batch(".expand-section", {
          onEnter: (elements) => {
            gsap.fromTo(elements, { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 0.7, ease: "power3.out", clearProps: "transform" });
          },
          start: "top 85%",
          once: true
        });

        ScrollTrigger.batch(".ticket", {
          onEnter: (elements) => {
            gsap.fromTo(elements, { opacity: 0, y: 50, rotateX: -5 }, { opacity: 1, y: 0, rotateX: 0, duration: 0.7, stagger: 0.12, ease: "power3.out", clearProps: "transform" });
          },
          start: "top 85%",
          once: true
        });
      });
    });

    // ─── TICKET 3D HOVER EFFECT ───
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

    // ─── ACCORDION EXPAND LOGIC ───
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

    // ─── BARCODE GENERATOR ───
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
    <main className="landing-page-root" style={{ opacity: isMounted ? 1 : 0, transition: "opacity 0.2s ease-in" }}>
      <style jsx global>{`
        :root {
          --paper: #f7f9fe;
          --paper-wash: #e7effd;
          --dark: #1f2233;
          --blue-deep: #0f2a4d;
          --blue: #a855f7;
          --blue-mid: #8b84f7;
          --blue-light: #9cc4fb;
          --sky: #8ecae6;
          --blue-grad: linear-gradient(135deg, #9cc4fb 0%, #a855f7 100%);
          --font-display: system-ui, sans-serif;
          --font-body: system-ui, sans-serif;
          --font-mono: monospace;
          --ease-out: cubic-bezier(0.22, 1, 0.36, 1);

          --glass-bg: linear-gradient(135deg, rgba(255, 255, 255, 0.5) 0%, rgba(255, 255, 255, 0.1) 100%);
          --glass-border: rgba(255, 255, 255, 0.4);
          --glass-shadow-outer: 0 12px 32px rgba(31, 38, 135, 0.05), 0 2px 8px rgba(31, 38, 135, 0.03);
          --glass-shadow-inner: inset 1.5px 1.5px 2px rgba(255, 255, 255, 0.95), inset -1.5px -1.5px 3px rgba(16, 17, 23, 0.04);
          --glass-shadow-hover: 0 16px 40px rgba(31, 38, 135, 0.08), 0 4px 12px rgba(31, 38, 135, 0.04);

          --pressed-bg: rgba(16, 17, 23, 0.02);
          --pressed-shadow: inset 1px 2px 5px rgba(16, 17, 23, 0.1), inset -1px -1px 3px rgba(255, 255, 255, 0.9);
        }
        .landing-page-root *, .landing-page-root *::before, .landing-page-root *::after { margin: 0; padding: 0; box-sizing: border-box; }
        .landing-page-root html { -webkit-font-smoothing: antialiased; overscroll-behavior: contain; scroll-behavior: smooth; }
        .landing-page-root {
          font-family: var(--font-body);
          color: var(--dark);
          overflow-x: hidden;
          background-color: #eef1f8;
          background-image:
            radial-gradient(ellipse at 15% 20%, rgba(150, 130, 240, 0.30) 0%, transparent 50%),
            radial-gradient(ellipse at 85% 15%, rgba(110, 180, 255, 0.32) 0%, transparent 50%),
            radial-gradient(ellipse at 75% 75%, rgba(210, 150, 240, 0.22) 0%, transparent 48%),
            radial-gradient(ellipse at 20% 80%, rgba(100, 200, 235, 0.28) 0%, transparent 50%),
            radial-gradient(ellipse at 50% 50%, rgba(255, 205, 215, 0.10) 0%, transparent 60%);
          min-height: 100vh;
        }
        .landing-page-root a { color: inherit; text-decoration: none; }
        .landing-page-root button { font-family: inherit; cursor: pointer; border: none; background: none; }
        .landing-page-root img, .landing-page-root svg { display: block; }
        .landing-page-root ul { list-style: none; }

        /* FLOATING PILL HEADER WITH FROSTED BLUR */
        .landing-page-root .header {
          position: fixed; top: 1.5rem; left: 0; right: 0; margin: 0 auto;
          transform: translateY(-20px);
          z-index: 100;
          width: calc(100% - 3rem); max-width: 1200px;
          display: flex; align-items: center; justify-content: space-between;
          padding: 0.75rem 1.25rem 0.75rem 2rem;
          border-radius: 100px;
          background: rgba(255, 255, 255, 0.75);
          backdrop-filter: blur(24px) saturate(180%);
          -webkit-backdrop-filter: blur(24px) saturate(180%);
          border: 1px solid rgba(255, 255, 255, 0.8);
          box-shadow: 0 10px 30px rgba(31, 38, 135, 0.1), inset 0 1px 0 rgba(255, 255, 255, 1);
          opacity: 0;
        }
        .landing-page-root .header__brand { display: flex; align-items: center; gap: 0.7rem; }
        .landing-page-root .header__logo {
          width: 32px; height: 32px; background: transparent;
          border: 1.5px solid var(--blue);
          border-radius: 8px; display: flex; align-items: center; justify-content: center;
          font-family: var(--font-display); font-weight: 700; font-size: 1.1rem; color: var(--blue);
        }
        .landing-page-root .header__name { font-family: var(--font-display); font-weight: 700; font-size: 1.15rem; letter-spacing: 0.04em; text-transform: uppercase; color: var(--dark); }
        .landing-page-root .header__nav { display: flex; align-items: center; gap: 2rem; }
        .landing-page-root .header__link {
          font-size: 0.875rem; font-weight: 600; color: rgba(31, 34, 51, 0.78); transition: color 0.2s ease; position: relative;
        }
        .landing-page-root .header__link:hover { color: var(--blue); }
        .landing-page-root .header__meta { display: flex; align-items: center; gap: 1rem; }
        .landing-page-root .header__login {
          font-size: 0.875rem; font-weight: 600; padding: 0.6rem 1.4rem;
          background: var(--pressed-bg);
          color: var(--dark);
          border: 1px solid rgba(16, 17, 23, 0.05);
          border-radius: 100px;
          box-shadow: var(--pressed-shadow);
          transition: all 0.3s var(--ease-out);
        }
        .landing-page-root .header__login:hover {
          box-shadow: inset 1px 2px 6px rgba(16, 17, 23, 0.15), inset -1px -1px 3px rgba(255,255,255,1);
        }
        .landing-page-root .header__pill {
          font-size: 0.875rem; font-weight: 600; padding: 0.6rem 1.4rem;
          background: var(--blue-grad); color: #fff; border-radius: 100px;
          box-shadow: 0 4px 12px rgba(109, 100, 244, 0.25), inset 1px 1px 2px rgba(255,255,255,0.3);
          position: relative; overflow: hidden; transition: transform 0.3s var(--ease-out), box-shadow 0.3s ease;
        }
        .landing-page-root .header__pill:hover { transform: translateY(-1px); box-shadow: 0 6px 16px rgba(109, 100, 244, 0.35), inset 1px 1px 2px rgba(255,255,255,0.4); }
        .landing-page-root .header__mobile-menu { display: none; flex-direction: column; gap: 5px; width: 24px; padding-right: 1rem; }
        .landing-page-root .header__mobile-menu span { display: block; height: 2px; background: var(--dark); border-radius: 2px; }

        .landing-page-root .hero {
          position: relative; height: 100vh; min-height: 700px;
          display: flex; flex-direction: column; justify-content: center; align-items: center;
          text-align: center; padding: 7rem 2rem 2rem; overflow: hidden;
        }
        .landing-page-root .hero__content { position: relative; z-index: 2; text-align: left; }
        .landing-page-root .hero__title {
          font-family: var(--font-display); font-weight: 700;
          font-size: clamp(3.2rem, 6.5vw, 5.8rem); line-height: 0.95; letter-spacing: -0.02em;
          text-transform: uppercase; margin-bottom: 1.5rem;
          background: var(--blue-grad); -webkit-background-clip: text;
          -webkit-text-fill-color: transparent; background-clip: text; opacity: 0;
          text-shadow: 0 0 2px rgba(0, 0, 0, 0.3);
        }
        .landing-page-root .hero__subtitle {
          font-size: 1.12rem; line-height: 1.7; color: rgba(31, 34, 51, 0.75);
          max-width: 500px; margin: 0 0 2.5rem; opacity: 0; font-weight: 500;
        }
        .landing-page-root .hero__ctas {
          display: flex; align-items: center; justify-content: flex-start; gap: 1rem; flex-wrap: wrap; opacity: 0;
        }
        .landing-page-root .hero__cta-primary {
          display: inline-flex; align-items: center; gap: 0.5rem; padding: 0.9rem 2.2rem;
          background: var(--dark); color: #fff; border-radius: 12px;
          font-weight: 600; font-size: 0.95rem; position: relative; overflow: hidden; transition: transform 0.3s var(--ease-out);
          box-shadow: 0 8px 20px rgba(31, 34, 51, 0.15), inset 1px 1px 1px rgba(255,255,255,0.1);
        }
        .landing-page-root .hero__cta-primary:hover { transform: translateY(-2px); }
        .landing-page-root .hero__cta-secondary {
          display: inline-flex; align-items: center; gap: 0.5rem; padding: 0.9rem 2.2rem;
          background: var(--glass-bg); backdrop-filter: blur(12px);
          border: 1px solid var(--glass-border); border-radius: 12px;
          font-weight: 600; font-size: 0.95rem; color: var(--dark); transition: all 0.3s ease;
          box-shadow: var(--glass-shadow-outer), var(--glass-shadow-inner);
        }
        .landing-page-root .hero__cta-secondary:hover { transform: translateY(-2px); box-shadow: var(--glass-shadow-hover), var(--glass-shadow-inner); }

        .landing-page-root .hero__grid {
          position: relative;
          z-index: 2;
          width: 100%;
          max-width: 1520px;
          display: grid; 
          grid-template-columns: 1.2fr 1.6fr;
          gap: 0.5rem;
          align-items: center; 
          text-align: left;
        }
        .landing-page-root .hero__grid .hero__content { max-width: none; }
        .landing-page-root .hero__grid .hero__subtitle { max-width: 32rem; }

        /* FULLY TRANSPARENT GLOBE WRAPPER */
        .landing-page-root .hero__globe {
          width: 100%;
          max-width: 820px;
          height: 620px;
          margin-left: -70px;
          position: relative;
          z-index: 2;
          background: transparent;
          backdrop-filter: none;
          -webkit-backdrop-filter: none;
          border: none;
          box-shadow: none;
          overflow: visible;
          display: flex;
          align-items: center;
          justify-content: center;
          opacity: 0;
          will-change: opacity, transform;
        }

        /* MARQUEE RIBBON */
        .landing-page-root .marquee-band {
          padding: 2rem 1.5rem;
          background: rgba(31, 34, 51, 0.85);
          backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
          border-top: 1px solid rgba(255, 255, 255, 0.1); border-bottom: 1px solid rgba(255, 255, 255, 0.1);
          overflow: hidden; position: relative; width: 100%;
        }
        .landing-page-root .marquee-band__track { display: flex; width: max-content; will-change: transform; animation: scrollMarquee 100s linear infinite; }
        .landing-page-root .marquee-band:hover .marquee-band__track { animation-play-state: paused; }
        .landing-page-root .marquee-band__group { display: flex; align-items: center; flex-shrink: 0; }
        .landing-page-root .marquee-band__item { display: flex; align-items: center; gap: 1rem; padding: 0 2.5rem; white-space: nowrap; }
        .landing-page-root .marquee-band__dot { width: 6px; height: 6px; border-radius: 50%; background: var(--blue-light); flex-shrink: 0; }
        .landing-page-root .marquee-band__text { font-family: var(--font-display); font-weight: 500; font-size: 1.1rem; color: rgba(251, 250, 255, 0.8); text-transform: uppercase; letter-spacing: 0.06em; }
        @keyframes scrollMarquee { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }

        .landing-page-root .section { padding: 4.5rem 2rem; max-width: 1200px; margin: 0 auto; scroll-margin-top: 112px; scroll-padding-top: 112px; }
        .landing-page-root .section__label { font-family: var(--font-mono); font-size: 0.75rem; font-weight: 600; color: #6d28d9; text-transform: uppercase; letter-spacing: 0.12em; margin-bottom: 0.8rem; }
        .landing-page-root .section__title { font-family: var(--font-display); font-weight: 700; font-size: clamp(2.5rem, 5vw, 4rem); line-height: 1.05; letter-spacing: -0.01em; margin-bottom: 1rem; }
        .landing-page-root .section__desc { font-size: 1.05rem; color: rgba(31, 34, 51, 0.7); font-weight: 500; max-width: 560px; line-height: 1.7; margin-bottom: 3rem; }

        .landing-page-root .product-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 1.5rem;
        }

        .landing-page-root .product-card {
          background: var(--glass-bg);
          backdrop-filter: blur(24px) saturate(120%);
          -webkit-backdrop-filter: blur(24px) saturate(120%);
          border-radius: 24px; padding: 2.25rem 2rem;
          position: relative; overflow: hidden;
          display: flex; flex-direction: column;
          transition: transform 0.4s var(--ease-out), box-shadow 0.4s var(--ease-out);
          cursor: default;
          border: 1px solid var(--glass-border);
          box-shadow: var(--glass-shadow-outer), var(--glass-shadow-inner);
        }
        .landing-page-root .product-card:hover { transform: translateY(-6px); box-shadow: var(--glass-shadow-hover), var(--glass-shadow-inner); }

        .landing-page-root .product-card__icon {
          width: 48px; height: 48px; border-radius: 14px;
          background: var(--dark);
          display: flex; align-items: center; justify-content: center;
          margin-bottom: 1.5rem; position: relative; z-index: 1;
          box-shadow: inset 1px 1px 2px rgba(255,255,255,0.2), 0 4px 12px rgba(31,34,51,0.15);
          flex-shrink: 0;
        }
        .landing-page-root .product-card__icon svg { width: 22px; height: 22px; stroke: #fff; fill: none; stroke-width: 1.5; stroke-linecap: round; stroke-linejoin: round; }
        .landing-page-root .product-card:nth-child(1) .product-card__icon { background: linear-gradient(135deg, #7c3aed, #9333ea); }
        .landing-page-root .product-card:nth-child(2) .product-card__icon { background: linear-gradient(135deg, #0f2a4d, #1e4a8f); }
        .landing-page-root .product-card:nth-child(3) .product-card__icon { background: linear-gradient(135deg, #059669, #10b981); }
        .landing-page-root .product-card:nth-child(4) .product-card__icon { background: linear-gradient(135deg, #9333ea, #6d28d9); }
        .landing-page-root .product-card:nth-child(5) .product-card__icon { background: linear-gradient(135deg, #0891b2, #22d3ee); }
        .landing-page-root .product-card:nth-child(6) .product-card__icon { background: linear-gradient(135deg, #6d28d9, #a855f7); }

        .landing-page-root .product-card__title { font-family: var(--font-display); font-weight: 600; font-size: 1.35rem; color: var(--dark); margin-bottom: 0.6rem; position: relative; z-index: 1; }
        .landing-page-root .product-card__desc { font-size: 0.9rem; font-weight: 500; color: rgba(31, 34, 51, 0.7); line-height: 1.6; position: relative; z-index: 1; flex-grow: 1; }

        .landing-page-root .product-card__tag {
          font-family: var(--font-mono); font-size: 0.6875rem; font-weight: 600;
          text-transform: uppercase; letter-spacing: 0.08em; margin-top: 1.5rem; position: relative; z-index: 1;
          display: inline-block; align-self: flex-start; padding: 0.5rem 1rem;
          color: #6d28d9;
          background: rgba(147, 51, 234, 0.07);
          border: 1px solid rgba(147, 51, 234, 0.18);
          border-radius: 8px;
          box-shadow: inset 1px 1px 2px rgba(255,255,255,0.6);
        }

        .landing-page-root .expand-section {
          background: var(--glass-bg); backdrop-filter: blur(24px) saturate(120%); -webkit-backdrop-filter: blur(24px) saturate(120%);
          border-radius: 32px; padding: 3rem; margin-top: 3rem;
          border: 1px solid var(--glass-border);
          box-shadow: var(--glass-shadow-outer), var(--glass-shadow-inner);
        }
        .landing-page-root .expand-section__title { font-family: var(--font-display); font-weight: 700; font-size: clamp(2rem, 4vw, 3rem); color: var(--dark); margin-bottom: 2rem; }
        .landing-page-root .expand-row { border-bottom: 1px solid rgba(31, 34, 51, 0.08); overflow: hidden; }
        .landing-page-root .expand-row:last-child { border-bottom: none; }
        .landing-page-root .expand-row__header { display: flex; align-items: center; justify-content: space-between; padding: 1.25rem 0; cursor: pointer; width: 100%; background: none; border: none; text-align: left; }
        .landing-page-root .expand-row__question { font-family: var(--font-display); font-weight: 600; font-size: 1.25rem; color: var(--dark); transition: color 0.2s ease; }
        .landing-page-root .expand-row__header:hover .expand-row__question { color: var(--blue); }
        .landing-page-root .expand-row__chevron { width: 24px; height: 24px; transition: transform 0.4s var(--ease-out); flex-shrink: 0; margin-left: 1rem; }
        .landing-page-root .expand-row__chevron svg { width: 24px; height: 24px; stroke: var(--blue); fill: none; stroke-width: 2; }
        .landing-page-root .expand-row.is-open .expand-row__chevron { transform: rotate(180deg); }
        .landing-page-root .expand-row__body { max-height: 0; overflow: hidden; transition: max-height 0.5s var(--ease-out); }
        .landing-page-root .expand-row.is-open .expand-row__body { max-height: 300px; }
        .landing-page-root .expand-row__answer { padding: 0 0 1.5rem; font-size: 0.95rem; font-weight: 500; color: rgba(31, 34, 51, 0.7); line-height: 1.7; max-width: 600px; }

        .landing-page-root .tickets-section { padding: 4.5rem 2rem; max-width: 1200px; margin: 0 auto; }
        .landing-page-root .tickets-section__header { text-align: center; margin-bottom: 3rem; }
        .landing-page-root .tickets-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 1.5rem; cursor: pointer; }
        .landing-page-root .ticket:nth-child(3) { grid-column: 1 / -1; max-width: 580px; margin: 0 auto; width: 100%; }
        .landing-page-root .ticket { position: relative; min-height: 300px; border-radius: 20px; padding: 1.8rem 1.9rem; background: radial-gradient(circle at 74% 24%, rgba(255,255,255,0.82) 0 3%, transparent 3.4%), radial-gradient(circle at 82% 29%, rgba(109,100,244,0.24) 0 5%, transparent 5.4%), radial-gradient(circle at 87% 17%, rgba(142,202,230,0.58) 0 3.5%, transparent 3.9%), linear-gradient(110deg, #e7effd 0%, #dceaff 45%, #eee9ff 100%); border: 1px solid rgba(255,255,255,0.76); overflow: hidden; transform-style: preserve-3d; perspective: 900px; transition: transform 0.45s var(--ease-out), box-shadow 0.45s var(--ease-out); box-shadow: 0 18px 40px rgba(31,38,135,0.12), inset 0 1px 0 rgba(255,255,255,0.8); }
        .landing-page-root .ticket::before { content: ''; position: absolute; inset: 0; background: radial-gradient(ellipse at 55% 60%, rgba(255,255,255,0.58), transparent 32%), linear-gradient(115deg, transparent 0 58%, rgba(255,255,255,0.28) 58.2% 68%, transparent 68.3%); pointer-events: none; }
        .landing-page-root .ticket::after { content: 'SHIPIN'; position: absolute; left: 43%; bottom: -2.4rem; color: rgba(255, 255, 255, 0.2); font-family: var(--font-display); font-size: 8.5rem; font-weight: 700; line-height: 1; letter-spacing: -0.04em; pointer-events: none; }
        .landing-page-root .ticket:hover { box-shadow: 0 24px 52px rgba(31,38,135,0.18), inset 0 1px 0 rgba(255,255,255,0.9); transform: translateY(-5px) rotateX(1deg); }
        .landing-page-root .ticket__sheen { position: absolute; inset: 0; background: radial-gradient(circle at var(--sheen-x, 50%) var(--sheen-y, 50%), rgba(255,255,255,0.34), transparent 50%); pointer-events: none; mix-blend-mode: overlay; }
        .landing-page-root .ticket__perforation { position: absolute; left: 0; top: 0; bottom: 0; width: 5px; background: repeating-linear-gradient(to bottom, transparent 0 7px, rgba(31,34,51,0.14) 7px 13px); }
        .landing-page-root .ticket__notch-left, .landing-page-root .ticket__notch-right { position: absolute; width: 28px; height: 28px; border-radius: 50%; background: #eef1f8; top: 50%; transform: translateY(-50%); box-shadow: inset 1px 1px 4px rgba(31,34,51,0.1); z-index: 2; }
        .landing-page-root .ticket__notch-left { left: -14px; border-right: 1px solid rgba(31,34,51,0.08); }
        .landing-page-root .ticket__notch-right { right: -14px; border-left: 1px solid rgba(31,34,51,0.08); }
        .landing-page-root .ticket__tear-line { position: absolute; top: 0; bottom: 0; width: 1px; background: repeating-linear-gradient(to bottom, rgba(31,34,51,0.22) 0 6px, transparent 6px 12px); z-index: 2; right: 150px; }
        .landing-page-root .ticket__content { position: relative; z-index: 3; display: grid; grid-template-columns: minmax(0, 1fr) 125px; align-items: stretch; gap: 1.3rem; min-height: 260px; }
        .landing-page-root .ticket__main { display: flex; min-width: 0; flex-direction: column; align-items: flex-start; padding-right: 0.35rem; }
        .landing-page-root .ticket__topline { display: flex; align-items: center; flex-wrap: wrap; gap: 0.65rem; margin-bottom: 1.25rem; color: rgba(31,34,51,0.7); font-family: var(--font-mono); font-size: 0.6875rem; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; }
        .landing-page-root .ticket__access { padding: 0.42rem 0.72rem; color: #ffffff; background: linear-gradient(135deg, #5b21b6, #7c3aed); border-radius: 100px; letter-spacing: 0.05em; font-size: 0.6875rem; box-shadow: 0 2px 8px rgba(124, 58, 237, 0.3), inset 1px 1px 1px rgba(255,255,255,0.25); }
        .landing-page-root .ticket[data-plan="express"] .ticket__access { background: linear-gradient(135deg, #6d28d9, #7c3aed); }
        .landing-page-root .ticket[data-plan="merchant"] .ticket__access { background: linear-gradient(135deg, #3b0764, #581c87); }
        .landing-page-root .ticket__number { color: rgba(31,34,51,0.78); font-size: 0.6875rem; }
        .landing-page-root .ticket__number::after { content: ' ✦'; color: rgba(31,34,51,0.7); }
        .landing-page-root .ticket__title { max-width: 100%; font-family: var(--font-display); font-weight: 700; font-size: clamp(2.6rem, 4.2vw, 4.5rem); line-height: 0.84; letter-spacing: -0.035em; text-transform: uppercase; color: var(--dark); margin-bottom: 1.15rem; }
        .landing-page-root .ticket__subtitle { max-width: 100%; margin-top: auto; padding-top: 0.9rem; font-size: 0.82rem; color: rgba(31,34,51,0.85); font-weight: 600; line-height: 1.55; }
        .landing-page-root .ticket__side { display: flex; width: 125px; flex-direction: column; align-items: flex-start; justify-content: space-between; padding: 0.2rem 0 0.2rem 1.1rem; text-align: left; flex-shrink: 0; }
        .landing-page-root .ticket__side::before { content: 'ADMIT ONE'; color: rgba(31,34,51,0.7); font-family: var(--font-mono); font-size: 0.6875rem; font-weight: 600; letter-spacing: 0.08em; }
        .landing-page-root .ticket__price { display: block; max-width: 100%; padding-bottom: 0.12rem; font-family: var(--font-display); font-weight: 700; font-size: clamp(2.3rem, 4vw, 3.5rem); line-height: 1.05; background: var(--blue-grad); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; filter: drop-shadow(0 2px 4px rgba(109,100,244,0.1)); }
        .landing-page-root .ticket__price-unit { display: block; max-width: 100%; margin-top: 0.35rem; font-size: 0.7rem; color: rgba(31,34,51,0.78); font-weight: 700; line-height: 1.3; letter-spacing: 0.08em; text-transform: uppercase; }
        .landing-page-root .ticket[data-plan="merchant"] .ticket__price { font-size: clamp(1.5rem, 2.5vw, 2.25rem); letter-spacing: -0.03em; }
        .landing-page-root .ticket__barcode { margin-top: auto; display: flex; align-items: flex-end; gap: 2px; justify-content: flex-start; }
        .landing-page-root .ticket__barcode-line { height: 28px; background: var(--dark); opacity: 0.6; border-radius: 1px; }
        .landing-page-root .ticket__code { margin-top: 0.35rem; color: rgba(31,34,51,0.54); font-family: var(--font-mono); font-size: 0.6875rem; font-weight: 600; letter-spacing: 0.08em; }

        /* FIXED MODAL BACKDROP BLUR STYLING */
        .landing-page-root .modal-overlay { 
          position: fixed; inset: 0; z-index: 9999; padding: 1.5rem; 
          background: rgba(15, 23, 42, 0.6); 
          backdrop-filter: blur(16px); 
          -webkit-backdrop-filter: blur(16px); 
          display: flex; align-items: center; justify-content: center; 
          opacity: 0; visibility: hidden; 
          transition: opacity 0.35s var(--ease-out), visibility 0.35s var(--ease-out); 
        }
        .landing-page-root .modal-overlay.is-active { opacity: 1; visibility: visible; }
        
        .landing-page-root .modal-container { 
          position: relative; width: min(100%, 620px); max-height: min(760px, calc(100vh - 3rem)); overflow: hidden; 
          background: linear-gradient(145deg, rgba(255, 255, 255, 0.95), rgba(240, 245, 255, 0.90)); 
          backdrop-filter: blur(24px); 
          -webkit-backdrop-filter: blur(24px); 
          border: 1px solid rgba(255, 255, 255, 0.95); 
          border-radius: 30px; padding: 2rem; 
          box-shadow: 0 30px 90px rgba(15, 23, 42, 0.35), var(--glass-shadow-inner); 
          transform: translateY(24px) scale(0.96); 
          transition: transform 0.45s var(--ease-out); 
        }
        .landing-page-root .modal-overlay.is-active .modal-container { transform: translateY(0) scale(1); }
        
        .landing-page-root .modal-kicker { position: relative; z-index: 1; display: flex; align-items: center; gap: 0.65rem; margin-bottom: 1.5rem; color: rgba(31,34,51,0.7); font-family: var(--font-mono); font-size: 0.6875rem; font-weight: 600; letter-spacing: 0.12em; text-transform: uppercase; }
        .landing-page-root .modal-kicker::before { content: ''; width: 28px; height: 1px; background: var(--blue); }
        .landing-page-root .modal-header { position: relative; z-index: 1; display: flex; align-items: flex-start; justify-content: space-between; gap: 1.25rem; margin-bottom: 1.5rem; }
        .landing-page-root .modal-badge { font-family: var(--font-mono); font-size: 0.6875rem; font-weight: 600; color: #fff; background: var(--blue-grad); padding: 0.42rem 0.8rem; border-radius: 100px; display: inline-flex; margin-bottom: 0.8rem; text-transform: uppercase; letter-spacing: 0.08em; box-shadow: 0 5px 14px rgba(109,100,244,0.24), inset 1px 1px 2px rgba(255,255,255,0.3); }
        .landing-page-root .modal-title { font-family: var(--font-display); font-weight: 700; font-size: clamp(2.2rem, 6vw, 3.3rem); line-height: 0.95; color: var(--dark); margin-bottom: 0.55rem; }
        .landing-page-root .modal-subtitle { max-width: 330px; font-size: 0.9rem; line-height: 1.55; font-weight: 500; color: rgba(31,34,51,0.78); }
        .landing-page-root .modal-price { flex-shrink: 0; text-align: right; padding-top: 0.4rem; }
        .landing-page-root .modal-price__value { font-family: var(--font-display); font-size: 2.35rem; font-weight: 700; line-height: 1; background: var(--blue-grad); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
        .landing-page-root .modal-price__unit { display: block; margin-top: 0.35rem; color: rgba(31,34,51,0.78); font-size: 0.7rem; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; }
        .landing-page-root .modal-panel { position: relative; z-index: 1; padding: 1.15rem; background: rgba(255,255,255,0.6); border: 1px solid rgba(255,255,255,0.8); border-radius: 18px; }
        .landing-page-root .modal-panel__label { margin-bottom: 0.8rem; color: rgba(31, 34, 51, 0.48); font-family: var(--font-mono); font-size: 0.6875rem; font-weight: 600; letter-spacing: 0.12em; text-transform: uppercase; }
        .landing-page-root .modal-features { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.7rem; }
        .landing-page-root .modal-features li { display: flex; align-items: flex-start; gap: 0.7rem; color: rgba(31,34,51,0.9); font-size: 0.92rem; font-weight: 600; line-height: 1.45; }
        .landing-page-root .modal-features li::before { content: '✓'; flex: 0 0 21px; width: 21px; height: 21px; display: grid; place-items: center; margin-top: 0.03rem; color: var(--blue); background: rgba(109,100,244,0.12); border-radius: 7px; font-size: 0.72rem; font-weight: 800; }
        .landing-page-root .modal-footer { position: relative; z-index: 1; display: flex; align-items: center; justify-content: space-between; gap: 1rem; margin-top: 1.5rem; }
        .landing-page-root .modal-note { display: flex; align-items: center; gap: 0.45rem; color: rgba(31,34,51,0.78); font-size: 0.72rem; font-weight: 600; line-height: 1.35; }
        .landing-page-root .modal-note svg { flex: 0 0 16px; width: 16px; height: 16px; stroke: var(--blue); fill: none; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
        
        .landing-page-root .modal-action { 
          display: inline-flex; align-items: center; justify-content: center; gap: 0.55rem; 
          padding: 0.85rem 1.15rem; min-width: 148px; color: #fff; background: var(--dark); 
          border-radius: 12px; font-size: 0.82rem; font-weight: 700; 
          box-shadow: 0 8px 18px rgba(31,34,51,0.16); 
          white-space: nowrap; 
          transition: transform 0.25s var(--ease-out), box-shadow 0.25s ease, background 0.25s ease; 
        }
        .landing-page-root .modal-action:hover { transform: translateY(-2px); background: #9333ea; box-shadow: 0 10px 22px rgba(109,100,244,0.28); }

        .landing-page-root .footer { background: rgba(255,255,255,0.4); backdrop-filter: blur(24px); border-top: 1px solid var(--glass-border); padding: 5rem 2rem 3rem; position: relative; overflow: hidden; }
        .landing-page-root .footer__big-word { font-family: var(--font-display); font-weight: 700; font-size: 19.5vw; line-height: 0.85; letter-spacing: -0.03em; color: var(--dark); text-transform: uppercase; user-select: none; opacity: 0.03; position: absolute; bottom: 0; right: 2rem; pointer-events: none; }
        .landing-page-root .footer__inner { max-width: 1200px; margin: 0 auto; position: relative; z-index: 1; }
        .landing-page-root .footer__top { display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 3rem; margin-bottom: 4rem; }
        .landing-page-root .footer__brand-block h3 { font-family: var(--font-display); font-weight: 700; font-size: 1.6rem; color: var(--dark); margin-bottom: 0.8rem; }
        .landing-page-root .footer__brand-block p { font-size: 0.9rem; font-weight: 500; color: rgba(31,34,51,0.78); max-width: 300px; line-height: 1.6; }
        .landing-page-root .footer__col h4 { font-family: var(--font-display); font-weight: 700; font-size: 0.9rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--dark); margin-bottom: 1.2rem; }
        .landing-page-root .footer__col ul li { margin-bottom: 0.8rem; }
        .landing-page-root .footer__col ul li a { font-size: 0.9rem; font-weight: 500; color: rgba(31,34,51,0.78); transition: color 0.2s ease; }
        .landing-page-root .footer__col ul li a:hover { color: var(--blue); }
        .landing-page-root .footer__bottom { border-top: 1px solid rgba(31,34,51, 0.08); padding-top: 2rem; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem; }
        .landing-page-root .footer__copy { font-size: 0.8rem; font-weight: 500; color: rgba(31,34,51,0.78); }
        .landing-page-root .footer__disclaimer { font-size: 0.75rem; font-weight: 500; color: rgba(31,34,51,0.78); max-width: 420px; text-align: right; line-height: 1.6; }

        @media (max-width: 1199px) { .landing-page-root .product-grid { grid-template-columns: repeat(2, 1fr); } }
        @media (max-width: 991px) { 
          .landing-page-root .product-grid { grid-template-columns: 1fr; max-width: 500px; margin: 0 auto; } 
          .landing-page-root .tickets-grid { grid-template-columns: 1fr; } 
          .landing-page-root .header__nav { display: none; } 
          .landing-page-root .header__mobile-menu { display: flex; } 
          .landing-page-root .hero__title { font-size: clamp(2.8rem, 8vw, 5rem); } 
          .landing-page-root .header { width: calc(100% - 2rem); } 
          .landing-page-root .hero__grid { grid-template-columns: 1fr; text-align: center; }
          .landing-page-root .hero__grid .hero__ctas { justify-content: center; }
          .landing-page-root .hero__globe { display: none; }
        }
      `}</style>

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
          <div className="ticket" data-ticket data-plan="explorer" onClick={() => setActiveModalPlan("explorer")}>
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

          <div className="ticket" data-ticket data-plan="express" onClick={() => setActiveModalPlan("express")}>
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

          <div className="ticket" data-ticket data-plan="merchant" onClick={() => setActiveModalPlan("merchant")}>
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
            <button className="expand-row__header" onClick={() => {}}><span className="expand-row__question">What if my package is damaged?</span><span className="expand-row__chevron"><svg viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg></span></button>
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

      {/* PRICING MODAL OVERLAY */}
      <div className={`modal-overlay ${activeModalPlan ? "is-active" : ""}`} onClick={() => setActiveModalPlan(null)}>
        {activePlanDetails && (
          <div className="modal-container" onClick={(e) => e.stopPropagation()}>
            <div className="modal-kicker">Pass details</div>
            <div className="modal-header">
              <div>
                <span className="modal-badge">{activePlanDetails.badge}</span>
                <h3 className="modal-title">{activePlanDetails.title}</h3>
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
              <button className="modal-action" onClick={() => { setActiveModalPlan(null); document.getElementById("hero")?.scrollIntoView({ behavior: "smooth" }); }}>
                Choose this pass <svg viewBox="0 0 24 24"><path d="M5 12h13"/><path d="M13 6l6 6-6 6"/></svg>
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}