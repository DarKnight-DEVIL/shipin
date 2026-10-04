"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { motion } from "framer-motion";
import { Sparkles, ArrowRight, Mail, MapPin } from "lucide-react";

import { auth } from "@/lib/firebase";
import SplineHero from "@/components/landing/SplineHero";

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

export default function Home() {
  const [loggedIn, setLoggedIn] = useState(false);

  useEffect(() => {
    return onAuthStateChanged(auth, (user) => setLoggedIn(!!user));
  }, []);

  const startHref = loggedIn
    ? "/requests/new"
    : "/login?next=/requests/new";

  return (
    <main className="relative h-dvh min-h-[100svh] w-full overflow-hidden bg-[#05050a] text-white">
      {/* 3D background — full page (do not change) */}
      <SplineHero />
      <div className="spline-badge-mask" aria-hidden />

      {/* Light scrim for readability; does NOT block mouse */}
      <div className="pointer-events-none absolute inset-0 z-[1] bg-gradient-to-b from-black/50 via-transparent to-black/55" />

      {/* UI layer: only interactive children receive clicks */}
      <div className="pointer-events-none relative z-10 flex h-full flex-col">
        <nav className="pointer-events-auto mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-5 md:px-8">
          <Link href="/" className="text-2xl font-bold md:text-3xl">
            Ship<span className="text-purple-400">IN</span>
          </Link>

          <div className="flex items-center gap-3 md:gap-5">
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
          <motion.div
            custom={0}
            variants={fadeUp}
            initial="hidden"
            animate="show"
            className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-1.5 text-sm text-purple-200 backdrop-blur-md"
          >
            <Sparkles className="h-4 w-4" />
            Shop India from anywhere
          </motion.div>

          <motion.h1
            custom={1}
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
            custom={2}
            variants={fadeUp}
            initial="hidden"
            animate="show"
            className="mt-5 max-w-xl text-base text-white/75 sm:text-lg"
          >
            Source, shop, and forward packages from India — clear quotes, global
            shipping.
          </motion.p>

          <motion.div
            custom={3}
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
            <Link
              href={loggedIn ? "/dashboard" : "/login"}
              className="inline-flex items-center justify-center rounded-xl border border-white/25 bg-white/5 px-8 py-4 text-base backdrop-blur-md hover:bg-white/10"
            >
              {loggedIn ? "Open Dashboard" : "Sign in"}
            </Link>
          </motion.div>
        </div>

        {/* Footer — glass strip, does not block Spline mouse tracking outside its own links */}
        <footer className="pointer-events-auto mx-auto w-full max-w-6xl px-6 pb-5 md:px-8">
          <div className="rounded-2xl border border-white/10 bg-black/40 px-5 py-4 backdrop-blur-md sm:px-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              {/* Contact */}
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-white/60 sm:text-sm">
                <a
                  href="mailto:contact.shipin@gmail.com"
                  className="inline-flex items-center gap-1.5 transition hover:text-purple-300"
                >
                  <Mail className="h-3.5 w-3.5 shrink-0" />
                  contact.shipin@gmail.com
                </a>
                <span className="hidden h-3 w-px bg-white/20 sm:block" aria-hidden />
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5 shrink-0" />
                  India · Warehouse & Operations
                </span>
              </div>

              {/* Copyright */}
              <p className="text-xs text-white/40 sm:text-right">
                © {new Date().getFullYear()} ShipIN. All rights reserved.
              </p>
            </div>
          </div>
        </footer>
      </div>
    </main>
  );
}