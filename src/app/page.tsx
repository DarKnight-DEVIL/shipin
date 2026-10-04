"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { motion } from "framer-motion";
import {
  ArrowRight,
  Package,
  Globe2,
  ShieldCheck,
  Truck,
  Mail,
  MapPin,
  Star,
} from "lucide-react";

import { auth } from "@/lib/firebase";
import SplineHero from "@/components/landing/SplineHero";
import Image from "next/image";

function timeAgo(isoDate: string): string {
  const then = new Date(isoDate).getTime();
  const now = Date.now();
  const seconds = Math.max(0, Math.floor((now - then) / 1000));

  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const months = Math.floor(days / 30);
  const years = Math.floor(days / 365);

  if (years > 0) return years === 1 ? "1 year ago" : `${years} years ago`;
  if (months > 0) return months === 1 ? "1 month ago" : `${months} months ago`;
  if (days > 0) return days === 1 ? "1 day ago" : `${days} days ago`;
  if (hours > 0) return hours === 1 ? "1 hour ago" : `${hours} hours ago`;
  if (minutes > 0) return minutes === 1 ? "1 minute ago" : `${minutes} minutes ago`;
  return "just now";
}

/* ─── animation helpers ─── */
const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: {
      delay: 0.12 + i * 0.08,
      duration: 0.5,
      ease: [0.22, 1, 0.36, 1] as const,
    },
  }),
};

const sectionFade = {
  hidden: { opacity: 0, y: 28 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1] as const },
  },
};

/* ─── content data (easy to extend) ─── */
const features = [
  {
    icon: Package,
    title: "Purchase anything",
    desc: "From niche websites to major Indian stores, we buy and forward it for you.",
  },
  {
    icon: Globe2,
    title: "Ship worldwide",
    desc: "Reliable international delivery with clear tracking at every step.",
  },
  {
    icon: ShieldCheck,
    title: "Secure & transparent",
    desc: "Quotes, payments, and support in one place. No hidden surprises.",
  },
  {
    icon: Truck,
    title: "End to end handling",
    desc: "Purchase, warehouse, pack, and ship everything handled by the ShipIN team.",
  },
];

const steps = [
  {
    step: "01",
    title: "Create a request",
    desc: "Paste product links you need from India.",
  },
  {
    step: "02",
    title: "Approve the quote",
    desc: "We share a clear quote, and you pay securely.",
  },
  {
    step: "03",
    title: "We ship it to you",
    desc: "Items arrive at our warehouse, get packed, and ship worldwide.",
  },
];

/** Add more objects here anytime — the marquee loops automatically */
const testimonials = [
  {
    name: "u/Valuable_Farm_2686",
    location: "Stralsund, Germany",
    text: "This was my first time using the service of an international shopper, and it honestly couldn’t have gone any better. Everything was perfect — from the communication, to the payment process, to the ordering and shipping. Everything worked out flawlessly without any problems. On top of that, he was super friendly as well. ❤️",
    rating: 5,
    postedAt: "2026-05-26"
  },
  {
    name: "u/Logical-Hawk8",
    location: "Palm Harbor, USA",
    text: "I made shipping payment on Jul 24 at 5pm; was provided tracking at 11pm and notices of export clearance, import clearance, and delivery on Aug 4. Package was received well packed. A+++",
    rating: 5,
    postedAt: "2026-08-15"
  },
  {
    name: "u/pookiemjmi",
    location: "Vietnam",
    text: "I just completed a successful transaction with ShipIN. They handled my requests very well and quickly, which was really helpful for a buyer like me who lives far away, very trustworthy!",
    rating: 5,
    postedAt: "2026-09-17"
  },
  {
    name: "Karlek Kouaya",
    location: "Rue des journaliers, France",
    text: "I'm very satisfied with the service. Everything went smoothly, and I would definitely recommend this service to others.",
    rating: 5,
    postedAt: "2026-10-04"
  },
  {
    name: "Neha P.",
    location: "Singapore",
    text: "Love the simple request flow. Pasted links, approved quote, done. Highly recommend.",
    rating: 5,
  },
  {
    name: "Carlos M.",
    location: "São Paulo, Brazil",
    text: "Cross-border shopping from India used to be a headache. ShipIN fixed that for me.",
    rating: 5,
  },
];

export default function Home() {
  const [loggedIn, setLoggedIn] = useState(false);

  useEffect(() => {
    return onAuthStateChanged(auth, (user) => setLoggedIn(!!user));
  }, []);

  const startHref = loggedIn
    ? "/requests/new"
    : "/login?next=/requests/new";

  const marqueeItems = [...testimonials, ...testimonials];

  return (
    <main className="relative w-full bg-[#05050a] text-white">
      {/* ═══════════════════════════════════════════
          HERO — full viewport, Spline + mouse tracker
         ═══════════════════════════════════════════ */}
      <section className="relative h-dvh min-h-[100svh] w-full overflow-hidden">
        <SplineHero />
        <div className="spline-badge-mask" aria-hidden />

        <div className="pointer-events-none absolute inset-0 z-[1] bg-gradient-to-b from-black/50 via-transparent to-black/55" />

        <div className="pointer-events-none relative z-10 flex h-full flex-col">
          <nav className="pointer-events-auto mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-5 md:px-8">
            <Link
              href="/"
              className="flex items-center gap-1 text-2xl font-bold md:text-3xl"
            >
              <Image
                src="/ShipIN.svg"
                alt="ShipIN"
                width={50}
                height={50}
                className="h-10 w-10 object-contain md:h-12 md:w-12"
                priority
              />
              <span>
                Ship<span className="text-purple-400">IN</span>
              </span>
            </Link>

            <div className="flex items-center gap-3 md:gap-5">
              <a
                href="#how-it-works"
                className="hidden text-sm text-white/70 transition hover:text-white sm:block"
              >
                How It Works
              </a>
              <a
                href="#testimonials"
                className="hidden text-sm text-white/70 transition hover:text-white sm:block"
              >
                Reviews
              </a>
              <Link
                href={loggedIn ? "/dashboard" : "/login"}
                className="text-sm text-white/70 hover:text-white"
              >
                {loggedIn ? "Dashboard" : "Login"}
              </Link>
              <Link
                href={startHref}
                className="shipin-btn-primary px-4 py-2 text-sm"
              >
                Get Started
              </Link>
            </div>
          </nav>

          <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center px-6 pb-6 text-center">
            <motion.h1
              custom={0}
              variants={fadeUp}
              initial="hidden"
              animate="show"
              className="text-4xl font-bold leading-[1.1] tracking-tight sm:text-5xl md:text-6xl lg:text-7xl"
            >
              Anything from India,
              <br />
              <span className="bg-gradient-to-r from-purple-300 via-violet-300 to-fuchsia-300 bg-clip-text text-transparent">
                delivered worldwide.
              </span>
            </motion.h1>

            <motion.p
              custom={1}
              variants={fadeUp}
              initial="hidden"
              animate="show"
              className="mt-5 max-w-xl text-base text-white/75 sm:text-lg"
            >
              Shop Indian online stores. We order and forward your packages globally with clear, upfront quotes and tracking.
            </motion.p>

            <motion.p
              custom={1}
              variants={fadeUp}
              initial="hidden"
              animate="show"
              className="mt-5 max-w-xl text-base text-white/75 sm:text-lg"
            >
              No hidden fees, no surprises.
            </motion.p>

            <motion.div
              custom={2}
              variants={fadeUp}
              initial="hidden"
              animate="show"
              className="pointer-events-auto mt-9 flex flex-col gap-3 sm:flex-row sm:gap-4"
            >
              <Link
                href={startHref}
                className="shipin-btn-primary inline-flex items-center justify-center gap-2 px-8 py-4 text-base"
              >
                Create Request
                <ArrowRight className="h-5 w-5" />
              </Link>
              <a
                href="#how-it-works"
                className="inline-flex items-center justify-center rounded-xl border border-white/25 bg-white/5 px-8 py-4 text-base backdrop-blur-md hover:bg-white/10"
              >
                How it works
              </a>
            </motion.div>
          </div>

          <p className="pb-6 text-center text-xs text-white/30">
            Scroll to explore
          </p>
        </div>
      </section>

      {/* ═══════════════════════════════════════════
          FEATURES
         ═══════════════════════════════════════════ */}
      <section
        id="features"
        className="relative z-10 border-t border-white/5 bg-[#05050a] px-6 py-14 md:px-8 md:py-16"
      >
        <div className="mx-auto max-w-6xl">
          <motion.div
            variants={sectionFade}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: "-80px" }}
            className="mb-10 text-center"
          >
            <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
              Built for seamless cross-border shopping
            </h2>
            <p className="mt-3 text-white/55">
              Everything you need to buy from India without the hassle.
            </p>
          </motion.div>

          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {features.map((f, i) => (
              <motion.div
                key={f.title}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-40px" }}
                transition={{
                  delay: i * 0.08,
                  duration: 0.5,
                  ease: [0.22, 1, 0.36, 1],
                }}
                className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 transition hover:border-purple-500/30 hover:bg-white/[0.05]"
              >
                <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-purple-500/15 text-purple-300">
                  <f.icon className="h-5 w-5" />
                </div>
                <h3 className="text-lg font-semibold">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-white/55">
                  {f.desc}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════
          HOW IT WORKS
         ═══════════════════════════════════════════ */}
      <section
        id="how-it-works"
        className="relative z-10 border-t border-white/5 bg-[#07070f] px-6 py-14 md:px-8 md:py-16"
      >
        <div className="mx-auto max-w-6xl">
          <motion.div
            variants={sectionFade}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: "-80px" }}
            className="mb-10 text-center"
          >
            <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
              How it works
            </h2>
            <p className="mt-3 text-white/55">
              Three simple steps from request to delivery.
            </p>
          </motion.div>

          <div className="grid gap-6 md:grid-cols-3">
            {steps.map((s, i) => (
              <motion.div
                key={s.step}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-40px" }}
                transition={{
                  delay: i * 0.1,
                  duration: 0.5,
                  ease: [0.22, 1, 0.36, 1],
                }}
                className="relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] p-7"
              >
                <span className="text-5xl font-bold text-purple-500/20">
                  {s.step}
                </span>
                <h3 className="mt-3 text-xl font-semibold">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-white/55">
                  {s.desc}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════
          TESTIMONIALS — infinite right → left marquee
         ═══════════════════════════════════════════ */}
      <section
        id="testimonials"
        className="relative z-10 border-t border-white/5 bg-[#07070f] py-14 md:py-16"
      >
        <div className="mx-auto mb-10 max-w-6xl px-6 text-center md:px-8">
          <motion.div
            variants={sectionFade}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: "-80px" }}
          >
            <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
              Loved by shoppers worldwide
            </h2>
            <p className="mt-3 text-white/55">
              Real feedback from people who ship with ShipIN.
            </p>
          </motion.div>
        </div>

        <div className="relative overflow-hidden">
          <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-16 bg-gradient-to-r from-[#07070f] to-transparent sm:w-24" />
          <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-16 bg-gradient-to-l from-[#07070f] to-transparent sm:w-24" />

          <div className="shipin-marquee flex w-max gap-5">
            {marqueeItems.map((t, i) => (
              <article
                key={`${t.name}-${i}`}
                className="w-[min(320px,80vw)] shrink-0 rounded-2xl border border-white/10 bg-white/[0.04] p-6"
              >
                <div className="mb-3 flex gap-0.5">
                  {Array.from({ length: 5 }).map((_, s) => (
                    <Star
                      key={s}
                      className={`h-3.5 w-3.5 ${
                        s < t.rating
                          ? "fill-purple-400 text-purple-400"
                          : "text-white/20"
                      }`}
                    />
                  ))}
                </div>
                <p className="text-sm leading-relaxed text-white/75">
                  “{t.text}”
                </p>
                <div className="mt-4 border-t border-white/10 pt-3">
                  <p className="text-sm font-medium text-white">{t.name}</p>
                  <p className="text-xs text-white/40">
                   {t.location}
                   <span className="mx-1.5 text-white/20">·</span>
                   {t.postedAt ? timeAgo(t.postedAt) : null}
                  </p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════
          FOOTER
         ═══════════════════════════════════════════ */}
      <footer className="relative z-10 border-t border-white/10 bg-[#05050a]">
        <div className="mx-auto max-w-6xl px-6 py-14 md:px-8">
          <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-4">
              <Link href="/" className="text-2xl font-bold">
                Ship<span className="text-purple-400">IN</span>
              </Link>
              <p className="text-sm leading-relaxed text-white/50">
                Your trusted partner for sourcing and shipping products from
                India to anywhere in the world.
              </p>
            </div>

            <div>
              <h4 className="mb-4 text-sm font-semibold uppercase tracking-wider text-white/80">
                Quick Links
              </h4>
              <ul className="space-y-2.5 text-sm text-white/50">
                <li>
                  <a href="#features" className="transition hover:text-purple-300">
                    Features
                  </a>
                </li>
                <li>
                  <a
                    href="#how-it-works"
                    className="transition hover:text-purple-300"
                  >
                    How It Works
                  </a>
                </li>
                <li>
                  <a
                    href="#testimonials"
                    className="transition hover:text-purple-300"
                  >
                    Reviews
                  </a>
                </li>
                <li>
                  <Link
                    href={startHref}
                    className="transition hover:text-purple-300"
                  >
                    Create Request
                  </Link>
                </li>
              </ul>
            </div>

            <div>
              <h4 className="mb-4 text-sm font-semibold uppercase tracking-wider text-white/80">
                Contact
              </h4>
              <ul className="space-y-3 text-sm text-white/50">
                <li className="flex items-start gap-2.5">
                  <Mail className="mt-0.5 h-4 w-4 shrink-0 text-purple-400" />
                  <a
                    href="mailto:contact.shipin@gmail.com"
                    className="transition hover:text-purple-300"
                  >
                    contact.shipin@gmail.com
                  </a>
                </li>
                <li className="flex items-start gap-2.5">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-purple-400" />
                  <span>
                    India
                    <br />
                    Warehouse & Operations
                  </span>
                </li>
              </ul>
            </div>

            <div>
              <h4 className="mb-4 text-sm font-semibold uppercase tracking-wider text-white/80">
                Support
              </h4>
              <ul className="space-y-2.5 text-sm text-white/50">
                <li>
                  <a
                    href="mailto:contact.shipin@gmail.com"
                    className="transition hover:text-purple-300"
                  >
                    Help & Support
                  </a>
                </li>
                <li>
                  <span className="opacity-60">Privacy Policy</span>
                </li>
                <li>
                  <span className="opacity-60">Terms of Service</span>
                </li>
              </ul>
            </div>
          </div>

          <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-white/10 pt-8 text-sm text-white/35 sm:flex-row">
            <p>© {new Date().getFullYear()} ShipIN. All rights reserved.</p>
            <p className="text-xs">Made with care for global shoppers</p>
          </div>
        </div>
      </footer>
    </main>
  );
}