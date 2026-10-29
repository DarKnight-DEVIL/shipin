"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Bricolage_Grotesque } from "next/font/google";
import {
  GoogleAuthProvider,
  signInWithPopup,
} from "firebase/auth";
import { motion } from "framer-motion";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import { toast } from "sonner";

import { auth } from "@/lib/firebase";
import { getUserProfile } from "@/lib/userProfile";

import "./login.css";

const display = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: {
      delay: 0.08 + i * 0.08,
      duration: 0.5,
      ease: [0.22, 1, 0.36, 1] as const,
    },
  }),
};

function Logo({ small = false }: { small?: boolean }) {
  return (
    <div className={`login__logo${small ? " login__logo--sm" : ""}`}>
      <span className="login__mark" aria-hidden="true">
        <ArrowUpRight className={small ? "h-5 w-5" : "h-8 w-8"} strokeWidth={2.6} />
      </span>
      <span className="login__word">ShipIN</span>
    </div>
  );
}

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
    <main className={`login ${display.variable}`}>
      <aside className="login__brand">
        <div className="login__art" aria-hidden="true" />
        <div className="login__brandbody">
          <Logo />
          <p className="login__tag">
            Buy from any Indian store. We inspect, pack and forward it to your
            address.
          </p>
          <p className="login__list">
            Requests · Quotes · Worldwide shipments
          </p>
        </div>
      </aside>

      <section className="login__panel">
        <Link href="/" className="login__back">
          <ArrowLeft className="h-4 w-4" />
          Back to home
        </Link>

        <div className="login__form">
          <Logo small />

          <motion.div custom={0} variants={fadeUp} initial="hidden" animate="show">
            <h1 className="login__title">Sign in</h1>
            <p className="login__sub">
              Sign in to manage your shopping requests, quotes, and worldwide
              shipments.
            </p>
          </motion.div>

          <motion.div custom={1} variants={fadeUp} initial="hidden" animate="show">
            <button
              type="button"
              onClick={handleGoogleLogin}
              disabled={loading}
              className="login__google"
            >
              {loading ? (
                <>
                  <span className="login__spin" />
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

          <motion.p custom={2} variants={fadeUp} initial="hidden" animate="show" className="login__terms">
            By continuing, you agree to ShipIN&apos;s terms of service.
          </motion.p>
        </div>
      </section>
    </main>
  );
}