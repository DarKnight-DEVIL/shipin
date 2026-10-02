"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { motion } from "framer-motion";
import {
  Package,
  Globe2,
  ShieldCheck,
  Truck,
  Sparkles,
  ArrowRight,
} from "lucide-react";

import { auth } from "@/lib/firebase";

const fadeUp = {
  hidden: { opacity: 0, y: 28 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: {
      delay: i * 0.1,
      duration: 0.6,
      ease: [0.22, 1, 0.36, 1] as const,
    },
  }),
};

const features = [
  {
    icon: Package,
    title: "Source anything",
    desc: "From local markets to major Indian stores — we buy and forward it for you.",
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
    title: "End-to-end handling",
    desc: "Purchase, warehouse, pack, and ship — handled by the ShipIN team.",
  },
];

const steps = [
  {
    step: "01",
    title: "Create a request",
    desc: "Paste product links or describe what you need from India.",
  },
  {
    step: "02",
    title: "Approve the quote",
    desc: "We source items, share a clear quote, and you pay securely.",
  },
  {
    step: "03",
    title: "We ship it to you",
    desc: "Items arrive at our warehouse, get packed, and ship worldwide.",
  },
];

export default function Home() {
  const [loggedIn, setLoggedIn] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setLoggedIn(!!user);
    });
    return unsubscribe;
  }, []);

  const startHref = loggedIn
    ? "/requests/new"
    : "/login?next=/requests/new";

  return (
    <main className="min-h-screen shipin-mesh text-slate-900 dark:text-white overflow-hidden">
      {/* Ambient glow orbs */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="animate-glow-pulse absolute -top-32 left-1/2 h-[420px] w-[420px] -translate-x-1/2 rounded-full bg-purple-500/20 blur-[100px]" />
        <div className="animate-float absolute bottom-0 right-0 h-[280px] w-[280px] rounded-full bg-blue-500/10 blur-[80px]" />
      </div>

      {/* Navbar */}
      <motion.nav
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative z-20 mx-auto flex max-w-6xl items-center justify-between px-6 py-5 md:px-8"
      >
        <Link
          href="/"
          className="text-2xl font-bold tracking-tight text-purple-600 dark:text-purple-400 md:text-3xl"
        >
          ShipIN
        </Link>

        <div className="flex items-center gap-3 md:gap-6">
          <a
            href="#how-it-works"
            className="hidden text-sm text-slate-600 transition hover:text-slate-900 dark:text-slate-300 dark:hover:text-white sm:block"
          >
            How It Works
          </a>

          {loggedIn ? (
            <Link
              href="/dashboard"
              className="text-sm text-slate-600 transition hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
            >
              Dashboard
            </Link>
          ) : (
            <Link
              href="/login"
              className="text-sm text-slate-600 transition hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
            >
              Login
            </Link>
          )}

          <Link
            href={startHref}
            className="shipin-btn-primary px-4 py-2 text-sm md:px-5"
          >
            Get Started
          </Link>
        </div>
      </motion.nav>

      {/* Hero */}
      <section className="relative z-10 mx-auto flex min-h-[calc(100vh-88px)] max-w-6xl flex-col items-center justify-center px-6 pb-20 pt-10 text-center md:px-8">
        <motion.div
          custom={0}
          variants={fadeUp}
          initial="hidden"
          animate="show"
          className="mb-6 inline-flex items-center gap-2 rounded-full border border-purple-500/25 bg-purple-500/10 px-4 py-1.5 text-sm text-purple-700 dark:text-purple-300"
        >
          <Sparkles className="h-4 w-4" />
          Shop India from anywhere
        </motion.div>

        <motion.h1
          custom={1}
          variants={fadeUp}
          initial="hidden"
          animate="show"
          className="max-w-4xl text-4xl font-bold leading-tight tracking-tight sm:text-5xl md:text-6xl lg:text-7xl"
        >
          Anything from India,
          <br />
          <span className="bg-gradient-to-r from-purple-500 via-violet-400 to-fuchsia-400 bg-clip-text text-transparent">
            delivered worldwide.
          </span>
        </motion.h1>

        <motion.p
          custom={2}
          variants={fadeUp}
          initial="hidden"
          animate="show"
          className="mt-6 max-w-2xl text-base text-slate-600 dark:text-slate-400 sm:text-lg md:text-xl"
        >
          Your trusted sourcing, shopping, and package forwarding partner in
          India — simple requests, clear quotes, global delivery.
        </motion.p>

        <motion.div
          custom={3}
          variants={fadeUp}
          initial="hidden"
          animate="show"
          className="mt-10 flex flex-col gap-3 sm:flex-row sm:gap-4"
        >
          <Link
            href={startHref}
            className="shipin-btn-primary inline-flex items-center justify-center gap-2 px-8 py-4 text-base md:text-lg"
          >
            Create Request
            <ArrowRight className="h-5 w-5" />
          </Link>

          <a
            href="#how-it-works"
            className="inline-flex items-center justify-center rounded-xl border border-slate-300 px-8 py-4 text-base transition hover:border-purple-400 hover:bg-purple-500/5 dark:border-slate-700 dark:hover:border-purple-500 md:text-lg"
          >
            Learn More
          </a>
        </motion.div>
      </section>

      {/* Features */}
      <section className="relative z-10 mx-auto max-w-6xl px-6 py-20 md:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.55 }}
          className="mb-12 text-center"
        >
          <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
            Built for seamless cross-border shopping
          </h2>
          <p className="mt-3 text-slate-600 dark:text-slate-400">
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
              className="shipin-card p-6"
            >
              <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-purple-500/15 text-purple-600 dark:text-purple-400">
                <f.icon className="h-5 w-5" />
              </div>
              <h3 className="text-lg font-semibold">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                {f.desc}
              </p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section
        id="how-it-works"
        className="relative z-10 mx-auto max-w-6xl px-6 py-20 md:px-8"
      >
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.55 }}
          className="mb-12 text-center"
        >
          <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
            How it works
          </h2>
          <p className="mt-3 text-slate-600 dark:text-slate-400">
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
              className="shipin-card relative overflow-hidden p-7"
            >
              <span className="text-5xl font-bold text-purple-500/15">
                {s.step}
              </span>
              <h3 className="mt-3 text-xl font-semibold">{s.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                {s.desc}
              </p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* CTA band */}
      <section className="relative z-10 mx-auto max-w-6xl px-6 pb-24 md:px-8">
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="shipin-card overflow-hidden border-purple-500/20 bg-gradient-to-br from-purple-600/10 via-transparent to-blue-500/10 p-10 text-center md:p-14"
        >
          <h2 className="text-2xl font-bold md:text-3xl">
            Ready to shop from India?
          </h2>
          <p className="mx-auto mt-3 max-w-lg text-slate-600 dark:text-slate-400">
            Create your first request in minutes. We’ll handle sourcing,
            packing, and shipping.
          </p>
          <Link
            href={startHref}
            className="shipin-btn-primary mt-8 inline-flex items-center gap-2 px-8 py-4 text-base"
          >
            Get Started
            <ArrowRight className="h-5 w-5" />
          </Link>
        </motion.div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-slate-200 py-8 text-center text-sm text-slate-500 dark:border-slate-800 dark:text-slate-500">
        © {new Date().getFullYear()} ShipIN. All rights reserved.
      </footer>
    </main>
  );
}