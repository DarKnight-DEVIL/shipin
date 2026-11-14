"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Bricolage_Grotesque } from "next/font/google";
import {
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendEmailVerification,
  signInWithRedirect,
} from "firebase/auth";
import { motion } from "framer-motion";
import { ArrowLeft, ArrowUpRight, Mail } from "lucide-react";
import { toast } from "sonner";

import { auth } from "@/lib/firebase";
import { clientEnv } from "@/config/env";
// The profile service is imported on demand below: it pulls in the Firestore
// SDK, and the login page only needs it after a successful sign-in.

import "@/styles/login.css";

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
  const [mode, setMode] = useState<"google" | "email">("google");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isRegister, setIsRegister] = useState(false);
  const [formError, setFormError] = useState("");

  const requestedNext = searchParams.get("next");

  const safeRequestedNext =
    requestedNext?.startsWith("/") && !requestedNext.startsWith("//")
      ? requestedNext
      : null;

  async function handleGoogleLogin() {
    try {
      // Must be the very first call â€” preserves the user-gesture token
      // so the browser doesn't block Firebase's popup (window.open).
      // No React state updates, no awaits, no async work before this.
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      const user = result.user;

      toast.success(
        `Welcome${user.displayName ? `, ${user.displayName}` : ""}!`
      );

      let destination = "/dashboard";

      try {
        const { getUserProfile } = await import(
          "@/features/users/services/userProfile"
        );
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

      setLoading(true);

      router.replace(destination);
      router.refresh();

      // Rate-limit gate runs AFTER the popup so the user-gesture token
      // is preserved for signInWithPopup above. Best-effort: never block
      // the user on analytics.
      try {
        await fetch("/api/auth/login-intent", { method: "POST" });
      } catch {
        // Ignore â€” analytics failures must not break sign-in.
      }
    } catch (error) {
      setLoading(false);
      // Log full error details for debugging â€” Firebase error codes are
      // often buried in nested properties, so stringify everything.
      console.error("FULL AUTH ERROR:", JSON.stringify(error, null, 2));
      console.error("Error code:", error instanceof Error ? (error as { code?: string }).code : "N/A");
      console.error("Error message:", error instanceof Error ? error.message : String(error));

      const err = error as { code?: string; message?: string };
      const errorCode = err?.code;

      // Map common Firebase Auth error codes to actionable user messages
      let userMessage = "Unable to sign in with Google.";

      if (errorCode === "auth/internal-error") {
        userMessage =
          "Google sign-in failed due to an internal error. This usually means the Google provider isn't properly configured in Firebase Console. Please contact support or try email sign-in.";
      } else if (errorCode === "auth/popup-blocked") {
        userMessage =
          "The sign-in popup was blocked by your browser. Please allow popups for this site and try again.";
      } else if (errorCode === "auth/popup-closed-by-user") {
        userMessage = "Sign-in was cancelled. Please try again.";
      } else if (errorCode === "auth/unauthorized-domain") {
        userMessage =
          "This domain isn't authorized for Google sign-in. Please contact support.";
      } else if (errorCode === "auth/operation-not-allowed") {
        userMessage =
          "Google sign-in is not enabled. Please contact support to enable it.";
      } else if (errorCode === "auth/network-request-failed") {
        userMessage = "Network error. Please check your connection and try again.";
      } else if (errorCode === "auth/too-many-requests") {
        userMessage =
          "Too many attempts. Please wait a moment and try again.";
      } else if (errorCode === "auth/cancelled-popup-request") {
        userMessage = "Another sign-in attempt is in progress. Please wait.";
      }

      // For auth/internal-error, try signInWithRedirect as a fallback.
      // The popup opens but Firebase OAuth fails internally â€” redirect
      // avoids popup timing issues entirely and works on all browsers.
      if (errorCode === "auth/internal-error" || errorCode === "auth/popup-blocked") {
        toast.info("Trying redirect sign-in instead...");
        const provider = new GoogleAuthProvider();
        void signInWithRedirect(auth, provider);
        return;
      }

      toast.error(userMessage);
      setLoading(false);
    }
  }

  /**
   * Surface validation and auth failures inline (assistive tech reads the
   * role="alert" region) as well as in a toast.
   */
  function fail(message: string) {
    setFormError(message);
    toast.error(message);
  }

  async function handleEmailAuth() {
    setFormError("");
    if (!email.trim() || !password) {
      fail("Please enter your email and password.");
      return;
    }
    if (password.length < 6) {
      fail("Password must be at least 6 characters.");
      return;
    }

    // Password strength rules
    const passwordErrors: string[] = [];
    if (password.length < 8) passwordErrors.push("at least 8 characters");
    if (!/[A-Z]/.test(password)) passwordErrors.push("one uppercase letter");
    if (!/[a-z]/.test(password)) passwordErrors.push("one lowercase letter");
    if (!/[0-9]/.test(password)) passwordErrors.push("one number");
    if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
      passwordErrors.push("one special character");
    }
    if (passwordErrors.length > 0) {
      fail(
        `Password must include ${passwordErrors.join(", ")}.`
      );
      return;
    }

    // Common password check (client-side blocklist)
    const COMMON_PASSWORDS = new Set([
      "password", "123456", "12345678", "123456789", "qwerty",
      "abc123", "password1", "111111", "123123", "admin", "letmein",
      "welcome", "monkey", "dragon", "master", "login", "princess",
      "football", "shadow", "sunshine", "trustno1", "iloveyou",
    ]);
    if (COMMON_PASSWORDS.has(password.toLowerCase())) {
      fail("That password is too common. Please choose a stronger one.");
      return;
    }

    // Rate-limit gate: ask the server whether this sign-in attempt is allowed.
    // This runs BEFORE any Firebase call to stop brute-force and credential-stuffing.
    try {
      const gateResponse = await fetch("/api/auth/login-intent", {
        method: "POST",
      });
      if (gateResponse.status === 429) {
        const retryAfter = Number(
          gateResponse.headers.get("Retry-After") ?? 60
        );
        fail(
          `Too many sign-in attempts. Try again in ${Math.max(1, Math.ceil(retryAfter))}s.`
        );
        return;
      }
      if (!gateResponse.ok) {
        fail("Unable to start sign-in. Please try again.");
        return;
      }
    } catch {
      // Network error â€” fail open (don't block legitimate users if the gate is down)
    }

    // Have I Been Pwned leak check (registration only).
    // Uses k-anonymity: we send only the first 5 hex chars of SHA-1(password).
    // The server never sees the full password or full hash.
    if (isRegister) {
      try {
        const hash = await crypto.subtle.digest(
          "SHA-1",
          new TextEncoder().encode(password)
        );
        const hex = Array.from(new Uint8Array(hash))
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("")
          .toUpperCase();
        const prefix = hex.slice(0, 5);
        const suffix = hex.slice(5);

        const leakResponse = await fetch("/api/auth/password-leak-check", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prefix }),
        });

        if (leakResponse.ok) {
          const { suffixes } = await leakResponse.json();
          if (Array.isArray(suffixes) && suffixes.includes(suffix)) {
            fail(
              "This password has appeared in a data breach. Please choose a different one."
            );
            return;
          }
        } else {
          // Deliberately fail open: an outage here must not stop people from
          // registering, and the password strength rules above still apply.
          // Surface it so the gap is visible in the console.
          console.warn(
            `Password leak check unavailable (HTTP ${leakResponse.status}); continuing without it.`
          );
        }
      } catch (leakError) {
        console.error("Password leak check failed:", leakError);
      }
    }

    setLoading(true);
    try {
      let user;
      if (isRegister) {
        const result = await createUserWithEmailAndPassword(
          auth,
          email.trim(),
          password
        );
        user = result.user;
        // Create the ShipIN profile for the new user.
        const { createUserProfile } = await import(
          "@/features/users/services/userProfile"
        );
        await createUserProfile(user.uid, {
          displayName: email.trim().split("@")[0],
          email: email.trim(),
        });
      } else {
        const result = await signInWithEmailAndPassword(
          auth,
          email.trim(),
          password
        );
        user = result.user;
      }

      // If the account is not yet verified, send a verification email
      // and redirect to the dedicated verification screen.
      if (!user.emailVerified) {
        try {
          await sendEmailVerification(user, {
            url: `${clientEnv.NEXT_PUBLIC_APP_URL ?? ""}/verify-email`,
          });
        } catch (sendError) {
          console.error("Failed to send verification email:", sendError);
        }
        toast.success(
          "We sent a verification email. Please check your inbox."
        );
        router.replace("/verify-email");
        router.refresh();
        return;
      }

      // Verified email â€” proceed to the dashboard (or admin).
      const { getUserProfile } = await import(
        "@/features/users/services/userProfile"
      );
      const profile = await getUserProfile(user.uid);
      let destination = "/dashboard";
      if (profile?.role === "admin") {
        destination = safeRequestedNext || "/admin/dashboard";
      } else {
        destination =
          safeRequestedNext && !safeRequestedNext.startsWith("/admin")
            ? safeRequestedNext
            : "/dashboard";
      }
      toast.success(`Welcome${user.displayName ? `, ${user.displayName}` : ""}!`);
      router.replace(destination);
      router.refresh();
    } catch (error: unknown) {
      console.error("Email auth failed:", error);
      const err = error as { code?: string };
      if (err.code === "auth/user-not-found") {
        fail("No account found with that email.");
      } else if (err.code === "auth/wrong-password" || err.code === "auth/invalid-credential") {
        fail("Incorrect email or password.");
      } else if (err.code === "auth/email-already-in-use") {
        fail("That email is already registered.");
        setIsRegister(false);
      } else if (err.code === "auth/weak-password") {
        fail("Password is too weak. Try a longer one.");
      } else {
        fail("Unable to sign in. Please try again.");
      }
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
            Requests Â· Quotes Â· Worldwide shipments
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
            <h1 className="login__title">
              {mode === "google" ? "Sign in" : isRegister ? "Create account" : "Sign in"}
            </h1>
            <p className="login__sub">
              {mode === "google"
                ? "Sign in to manage your shopping requests, quotes, and worldwide shipments."
                : isRegister
                  ? "Create a ShipIN account to track your international shipments."
                  : "Sign in with your email and password."}
            </p>
          </motion.div>

          {formError && (
            <p className="login__error" role="alert" id="login-error">
              {formError}
            </p>
          )}

          {mode === "email" && (
            <motion.div custom={1} variants={fadeUp} initial="hidden" animate="show">
              <form
                className="login__email-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  handleEmailAuth();
                }}
              >
                <label className="login__field">
                  <span className="login__label">Email</span>
                  <input
                    type="email"
                    className="login__input"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    autoComplete="email"
                    disabled={loading}
                    aria-invalid={formError ? true : undefined}
                    aria-describedby={formError ? "login-error" : undefined}
                    required
                  />
                </label>

                <label className="login__field">
                  <span className="login__label">Password</span>
                  <input
                    type="password"
                    className="login__input"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢"
                    autoComplete={isRegister ? "new-password" : "current-password"}
                    disabled={loading}
                    aria-invalid={formError ? true : undefined}
                    aria-describedby={formError ? "login-error" : undefined}
                    required
                  />
                </label>

                <button
                  type="submit"
                  className="login__google"
                  disabled={loading}
                >
                  {loading ? (
                    <>
                      <span className="login__spin" />
                      {isRegister ? "Creating account..." : "Signing in..."}
                    </>
                  ) : (
                    <>
                      <Mail className="h-5 w-5 shrink-0" />
                      {isRegister ? "Create account" : "Sign in"}
                    </>
                  )}
                </button>

                <p className="login__terms">
                  {isRegister ? (
                    <>
                      By creating an account you agree to ShipIN&apos;s terms of service.
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="login__link"
                        onClick={() => setIsRegister(true)}
                      >
                        Create an account
                      </button>
                    </>
                  )}
                </p>
              </form>
            </motion.div>
          )}

          {mode === "google" && (
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

              <p className="login__terms">
                By continuing, you agree to ShipIN&apos;s terms of service.
              </p>

                            <p className="login__switch">
                Don&apos;t have an account?{" "}
                <button
                  type="button"
                  className="login__link"
                  onClick={() => setIsRegister(true)}
                >
                  Create one
                </button>
              </p>

              <button
                type="button"
                className="login__link"
                onClick={() => setMode("email")}
              >
                Sign in with email
              </button>
            </motion.div>
          )}

          {mode === "email" && (
            <motion.p custom={2} variants={fadeUp} initial="hidden" animate="show" className="login__switch">
              Already have a Google account?{" "}
              <button type="button" className="login__link" onClick={() => setMode("google")}>
                Sign in with Google instead
              </button>
            </motion.p>
          )}
        </div>
      </section>
    </main>
  );
}
