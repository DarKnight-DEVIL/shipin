"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  GoogleAuthProvider,
  signInWithPopup,
} from "firebase/auth";
import { motion } from "framer-motion";
import { ArrowLeft, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { auth } from "@/lib/firebase";
import { getUserProfile } from "@/lib/userProfile";

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: {
      delay: i * 0.1,
      duration: 0.55,
      ease: [0.22, 1, 0.36, 1] as const,
    },
  }),
};

export default function LoginClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);

  const requestedNext = searchParams.get("next");

  const safeRequestedNext =
    requestedNext?.startsWith("/") && !requestedNext.startsWith("//")
      ? requestedNext
      : null;

  async function handleGoogleLogin() {
    try {
      setLoading(true);
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      const user = result.user;

      toast.success(
        `Welcome${user.displayName ? `, ${user.displayName}` : ""}!`
      );

      let destination = "/dashboard";

      try {
        const profile = await getUserProfile(user.uid);
        if (profile?.role === "admin") {
          destination = safeRequestedNext || "/admin/dashboard";
        } else {
          destination =
            safeRequestedNext && !safeRequestedNext.startsWith("/admin")
              ? safeRequestedNext
              : "/dashboard";
        }
      } catch (profileError) {
        console.error("Profile load failed:", profileError);
        destination =
          safeRequestedNext && !safeRequestedNext.startsWith("/admin")
            ? safeRequestedNext
            : "/dashboard";
      }

      router.replace(destination);
      router.refresh();
    } catch (error) {
      console.error("Google login failed:", error);
      toast.error("Unable to sign in with Google.");
      setLoading(false);
    }
  }

  return (
    <main className="relative min-h-screen shipin-mesh text-slate-900 dark:text-white overflow-hidden flex items-center justify-center px-4">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="animate-glow-pulse absolute -top-24 left-1/2 h-[380px] w-[380px] -translate-x-1/2 rounded-full bg-purple-500/20 blur-[100px]" />
        <div className="animate-float absolute bottom-10 right-10 h-[220px] w-[220px] rounded-full bg-blue-500/10 blur-[70px]" />
        <div className="animate-float absolute top-1/3 left-8 h-[160px] w-[160px] rounded-full bg-fuchsia-500/10 blur-[60px]" style={{ animationDelay: "1.5s" }} />
      </div>

      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="absolute top-6 left-6 z-20 md:top-8 md:left-8"
      >
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm text-slate-600 transition hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to home
        </Link>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 28, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className="relative z-10 w-full max-w-[420px]"
      >
        <div className="shipin-card shipin-glass overflow-hidden p-8 md:p-10">
          <motion.div
            custom={0}
            variants={fadeUp}
            initial="hidden"
            animate="show"
            className="mb-6 flex justify-center"
          >
            <span className="inline-flex items-center gap-2 rounded-full border border-purple-500/25 bg-purple-500/10 px-3.5 py-1 text-xs font-medium text-purple-700 dark:text-purple-300">
              <Sparkles className="h-3.5 w-3.5" />
              Secure sign-in
            </span>
          </motion.div>

          <motion.div
            custom={1}
            variants={fadeUp}
            initial="hidden"
            animate="show"
            className="text-center"
          >
            <Link
              href="/"
              className="text-3xl font-bold tracking-tight text-purple-600 dark:text-purple-400 md:text-4xl"
            >
              ShipIN
            </Link>
            <p className="mt-3 text-sm leading-relaxed text-slate-600 dark:text-slate-400 md:text-base">
              Sign in to manage your shopping requests,
              <br className="hidden sm:block" />
              quotes, and worldwide shipments.
            </p>
          </motion.div>

          <motion.div
            custom={2}
            variants={fadeUp}
            initial="hidden"
            animate="show"
            className="mt-8"
          >
            <button
              type="button"
              onClick={handleGoogleLogin}
              disabled={loading}
              className="group relative flex w-full items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white px-5 py-3.5 text-sm font-semibold text-slate-800 shadow-sm transition hover:border-purple-300 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-55 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:hover:border-purple-500/50"
            >
              {loading ? (
                <>
                  <span className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-purple-600 dark:border-slate-600 dark:border-t-purple-400" />
                  Signing in...
                </>
              ) : (
                <>
                  <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                  </svg>
                  Continue with Google
                </>
              )}
            </button>
          </motion.div>

          <motion.p
            custom={3}
            variants={fadeUp}
            initial="hidden"
            animate="show"
            className="mt-6 text-center text-xs text-slate-500 dark:text-slate-500"
          >
            By continuing, you agree to ShipIN&apos;s terms of service.
          </motion.p>
        </div>
      </motion.div>
    </main>
  );
}