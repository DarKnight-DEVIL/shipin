"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Bricolage_Grotesque } from "next/font/google";
import {
  GoogleAuthProvider,
  initializeRecaptchaConfig,
  sendPasswordResetEmail,
  signInWithCredential,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendEmailVerification,
  signInWithPopup,
  signInWithRedirect,
} from "firebase/auth";
import type { User } from "firebase/auth";
import {
  FirebaseMfaError,
  RECAPTCHA_CONTAINER_ID,
  confirmSecondFactorChallenge,
  isMultiFactorRequired,
  startSecondFactorChallenge,
  type SecondFactorChallenge,
} from "@/lib/firebaseMfa";
import { motion } from "framer-motion";
import { ArrowLeft, ArrowUpRight, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";

import { auth, getAppCheckToken } from "@/lib/firebase";
import {
  FIREBASE_MANAGED_GOOGLE_CLIENT_ID,
  autoPromptGoogleSignIn,
  cancelGooglePrompt,
  disableGoogleAutoSelect,
  loadGoogleIdentity,
} from "@/lib/googleIdentity";
import { clientEnv } from "@/config/env";
import { verificationEmailOptions } from "@/lib/emailVerification";
import SigningInOverlay from "@/components/SigningInOverlay";
import {
  clearAuthRedirectPending,
  markAuthRedirectPending,
} from "@/lib/authRedirectPending";
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
        <ArrowUpRight
          className={small ? "h-5 w-5" : "h-8 w-8"}
          strokeWidth={2.6}
        />
      </span>
      <span className="login__word">ShipIN</span>
    </div>
  );
}

/**
 * Firebase's page for the console setting behind
 * `auth/unauthorized-domain`. Preview deployments get a new host on
 * every deploy, and only hosts listed under Auth -> Settings ->
 * Authorized domains can start a sign-in, so this is the one link that
 * actually helps.
 */
const AUTHORIZED_DOMAINS_DOC =
  "https://support.google.com/firebase/answer/6400741";

/**
 * Google OAuth client for the in-page GIS flow. Defaults to the
 * Firebase-managed web client for this project; NEXT_PUBLIC_GOOGLE_CLIENT_ID
 * overrides it.
 */
const GOOGLE_CLIENT_ID =
  clientEnv.NEXT_PUBLIC_GOOGLE_CLIENT_ID || FIREBASE_MANAGED_GOOGLE_CLIENT_ID;

export default function LoginClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isRegister, setIsRegister] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  /**
   * Explicit 18+ and policy acceptance, required to create an account. The
   * previous copy said "by creating an account you agree" with no action, which
   * is not consent, and nothing anywhere asked the customer's age — while the
   * Privacy Policy says the service is 18+ and the DPDP age checks expect an
   * adult.
   */
  const [acceptedPolicies, setAcceptedPolicies] = useState(false);
  const [formError, setFormError] = useState("");
  // A Google sign-in is completing (popup open, credential exchange, or the
  // redirect fallback in flight). The whole page is covered by the
  // signing-in interstitial so the form never appears to stall or flash
  // back mid-flow.
  const [googlePending, setGooglePending] = useState(false);
  // Optional documentation link rendered under the inline error, for
  // failures a user cannot fix from this page.
  const [formErrorHelp, setFormErrorHelp] = useState<{
    href: string;
    label: string;
  } | null>(null);

  // Second-factor challenge, present only while a sign-in is waiting for an
  // SMS code from Firebase Identity Platform.
  const [mfaChallenge, setMfaChallenge] =
    useState<SecondFactorChallenge | null>(null);
  const [mfaCode, setMfaCode] = useState("");
  const [mfaBusy, setMfaBusy] = useState(false);
  const [mfaError, setMfaError] = useState("");

  const requestedNext = searchParams.get("next");

  // Warm up the slow parts of the sign-in path while the page is still
  // interactive. App Check mints its token lazily on first use and Auth
  // fetches the reCAPTCHA config before its first protected call; paying both
  // at click time adds 2-3s to "Continue with Google", long enough that users
  // click again. Minting here (auto-refresh then keeps it current) makes the
  // click navigate in under a second. Best-effort: a failed warm-up only means
  // the click pays the cost, as before.
  useEffect(() => {
    void getAppCheckToken();
    void initializeRecaptchaConfig(auth).catch(() => {});
    // Preload the Google Identity Services script so the in-page credential
    // flow is ready before the first click.
    void loadGoogleIdentity().catch(() => {});
    // Auto-prompt One Tap with the page: the chooser is then already on
    // screen when the user reaches for the button, and auto_select signs
    // returning users in without any click at all. The credential handler
    // only touches state setters and module-level Firebase singletons, so it
    // behaves identically on every render — mount-only is the intent.
    autoPromptGoogleSignIn(GOOGLE_CLIENT_ID, (credential) => {
      void completeGoogleCredential(credential);
    });
    // Cancel any pending One Tap / FedCM prompt when leaving the login page
    // so it does not follow the user onto the dashboard or other pages.
    return () => {
      cancelGooglePrompt();
    };
    // The credential handler only touches state setters and module-level
    // Firebase singletons, so it behaves identically on every render —
    // mount-only is the intent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const safeRequestedNext =
    requestedNext?.startsWith("/") && !requestedNext.startsWith("//")
      ? requestedNext
      : null;

  /** Post-authentication routing, shared by every sign-in path. */
  async function finishSignIn(user: User) {
    // A completed session must not be followed by further silent auto
    // sign-in prompts.
    disableGoogleAutoSelect();
    if (!user.emailVerified) {
      try {
        await sendEmailVerification(user, verificationEmailOptions());
      } catch (sendError) {
        console.error("Failed to send verification email:", sendError);
      }
      toast.success("We sent a verification email. Please check your inbox.");
      router.replace("/verify-email");
      router.refresh();
      return;
    }

    let destination = "/dashboard";

    try {
      const { ensureUserProfile } =
        await import("@/features/users/services/userProfile");
      const profile = await ensureUserProfile({
        uid: user.uid,
        displayName: user.displayName,
        email: user.email,
        photoURL: user.photoURL,
      });

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

    toast.success(`Welcome${user.displayName ? `, ${user.displayName}` : ""}!`);
    router.replace(destination);
    router.refresh();
  }

  /**
   * If sign-in stopped for a second factor, send its code and show the form.
   * Returns true when the error was handled.
   */
  async function beginSecondFactor(error: unknown): Promise<boolean> {
    if (!isMultiFactorRequired(error)) return false;

    try {
      const challenge = await startSecondFactorChallenge(auth, error);
      setMfaChallenge(challenge);
      setMfaCode("");
      setMfaError("");
      setFormError("");
      setFormErrorHelp(null);
      toast.success("We sent you a verification code by SMS.");
    } catch (challengeError) {
      fail(
        challengeError instanceof FirebaseMfaError
          ? challengeError.message
          : "Could not start SMS verification. Try again."
      );
    }

    return true;
  }

  /** Complete the second factor, then continue the normal post-login flow. */
  async function verifySecondFactor(event: React.FormEvent) {
    event.preventDefault();

    if (!mfaChallenge || mfaBusy) return;

    setMfaBusy(true);
    setMfaError("");

    try {
      const user = await confirmSecondFactorChallenge(
        mfaChallenge,
        mfaCode.trim()
      );
      setMfaChallenge(null);
      setMfaCode("");
      await finishSignIn(user);
    } catch (verificationError) {
      setMfaError(
        verificationError instanceof FirebaseMfaError
          ? verificationError.message
          : "That code could not be verified."
      );
    } finally {
      setMfaBusy(false);
      setLoading(false);
    }
  }

  async function handleGoogleLogin() {
    // The button opens the classic Google chooser in a popup. The One Tap
    // chooser auto-prompted on page load stays independent — this is the
    // explicit path for people who dismissed it or landed without it. The
    // popup works because /__/auth is served same-origin (see next.config.ts)
    // and the auth helper frames are allowed by our own frame headers; before
    // that, the popup's result never came back and redirect was the only
    // flow that worked.
    setLoading(true);
    setGooglePending(true);
    try {
      const result = await signInWithPopup(auth, new GoogleAuthProvider());
      await finishSignIn(result.user);
    } catch (error) {
      const code = (error as { code?: string })?.code;

      // Closing the chooser, or a second click superseding the first, is the
      // user changing their mind — not a failure to apologise for.
      if (
        code === "auth/popup-closed-by-user" ||
        code === "auth/cancelled-popup-request"
      ) {
        setLoading(false);
        setGooglePending(false);
        return;
      }

      // A blocker killed the popup before it opened. The redirect flow (with
      // AuthRedirectHandler completing it on return) is the fallback. Mark
      // the trip so the return renders the signing-in interstitial instead
      // of flashing the login form back.
      if (code === "auth/popup-blocked") {
        markAuthRedirectPending();
        try {
          await signInWithRedirect(auth, new GoogleAuthProvider());
          // The browser leaves this page; AuthRedirectHandler finishes the
          // flow, including the best-effort login-intent ping.
          return;
        } catch (redirectError) {
          clearAuthRedirectPending();
          await handleAuthFailure(redirectError);
          return;
        }
      }

      await handleAuthFailure(error);
    }
  }

  async function completeGoogleCredential(credential: string) {
    setGooglePending(true);
    try {
      const result = await signInWithCredential(
        auth,
        GoogleAuthProvider.credential(credential)
      );
      await finishSignIn(result.user);
    } catch (error) {
      await handleAuthFailure(error);
    }
  }

  /**
   * Shared failure path for every Google sign-in attempt (credential and
   * redirect flows): maps Firebase error codes to actionable user messages
   * and surfaces them inline as well as in a toast.
   */
  async function handleAuthFailure(error: unknown) {
    if (await beginSecondFactor(error)) {
      setLoading(false);
      setGooglePending(false);
      return;
    }

    setLoading(false);
    setGooglePending(false);
    // The previous inline error is about a different attempt, so it must
    // not outlive this one. Clearing it also unmounts any documentation
    // link, which only renders beside an inline error.
    setFormError("");
    // Log full error details for debugging — Firebase error codes are
    // often buried in nested properties, so stringify everything.
    console.error("FULL AUTH ERROR:", JSON.stringify(error, null, 2));
    console.error(
      "Error code:",
      error instanceof Error ? (error as { code?: string }).code : "N/A"
    );
    console.error(
      "Error message:",
      error instanceof Error ? error.message : String(error)
    );

    const err = error as { code?: string; message?: string };
    const errorCode = err?.code;

    // Map common Firebase Auth error codes to actionable user messages
    let userMessage = "Unable to sign in with Google.";

    if (errorCode === "auth/internal-error") {
      userMessage =
        "Google sign-in failed due to an internal error. This usually means the Google provider isn't properly configured in Firebase Console. Please contact support or try email sign-in.";
    } else if (errorCode === "auth/unauthorized-domain") {
      // The message named support and nothing else, so the one fact that
      // fixes it - this host is missing from the authorized list - never
      // reached anyone. Shown inline as well as toasted, because a toast
      // cannot carry the link.
      userMessage =
        "This domain isn't authorized for sign-in. Add it to Firebase Auth " +
        "> Settings > Authorized domains - every preview deployment needs " +
        "its own host added.";
      setFormError(userMessage);
      setFormErrorHelp({
        href: AUTHORIZED_DOMAINS_DOC,
        label: "See the authorized domains documentation",
      });
    } else if (errorCode === "auth/operation-not-allowed") {
      userMessage =
        "Google sign-in is not enabled. Please contact support to enable it.";
    } else if (errorCode?.includes("app-check")) {
      // Firebase App Check enforcement on Identity Toolkit rejects every
      // sign-in, for every provider, before credentials are even checked.
      // Without this branch it read as "internal error" and looked like an
      // OAuth misconfiguration.
      userMessage =
        "Sign-in is blocked by Firebase App Check for this project. An administrator must disable App Check enforcement on Identity Toolkit, or register this web app in App Check.";
      console.error(
        "[auth] App Check is enforced on Identity Toolkit and the web client has no valid token. In Firebase Console → App Check → APIs, set Identity Toolkit / Identity Platform to Unenforced (or register the web app with a reCAPTCHA v3 key)."
      );
    } else if (errorCode === "auth/network-request-failed") {
      userMessage =
        "Network error. Please check your connection and try again.";
    } else if (errorCode === "auth/too-many-requests") {
      userMessage = "Too many attempts. Please wait a moment and try again.";
    }

    toast.error(userMessage);
    setLoading(false);
  }

  /**
   * Surface validation and auth failures inline (assistive tech reads the
   * role="alert" region) as well as in a toast.
   */
  function fail(message: string) {
    setFormErrorHelp(null);
    setFormError(message);
    toast.error(message);
  }

  /**
   * Password reset: sends Firebase's reset email to the address in the email
   * field. The response deliberately never reveals whether the account
   * exists — the same message goes out either way, so the form cannot be
   * used to enumerate accounts.
   */
  async function handleForgotPassword() {
    setFormError("");
    setFormErrorHelp(null);
    if (!email.trim()) {
      fail("Enter your email above, then tap Forgot password again.");
      return;
    }
    try {
      await sendPasswordResetEmail(
        auth,
        email.trim(),
        verificationEmailOptions()
      );
    } catch (resetError) {
      // A wrong address or an unreachable Firebase must read the same to the
      // user; the details go to the console instead.
      console.error("Password reset request failed:", resetError);
    }
    toast.success(
      `If ${email.trim()} has an account, a reset link is on its way.`
    );
  }

  async function handleEmailAuth() {
    setFormError("");
    if (!email.trim() || !password) {
      fail("Please enter your email and password.");
      return;
    }
    // Password policy belongs to account creation only. Enforcing it on
    // sign-in locked out every existing user whose password predates the
    // current rules (or was set outside this form), because the check ran
    // before Firebase ever saw the credentials.
    if (isRegister) {
      const passwordErrors: string[] = [];
      if (password.length < 8) passwordErrors.push("at least 8 characters");
      if (!/[A-Z]/.test(password)) passwordErrors.push("one uppercase letter");
      if (!/[a-z]/.test(password)) passwordErrors.push("one lowercase letter");
      if (!/[0-9]/.test(password)) passwordErrors.push("one number");
      if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
        passwordErrors.push("one special character");
      }
      if (passwordErrors.length > 0) {
        fail(`Password must include ${passwordErrors.join(", ")}.`);
        return;
      }

      // Common password check (client-side blocklist)
      const COMMON_PASSWORDS = new Set([
        "password",
        "123456",
        "12345678",
        "123456789",
        "qwerty",
        "abc123",
        "password1",
        "111111",
        "123123",
        "admin",
        "letmein",
        "welcome",
        "monkey",
        "dragon",
        "master",
        "login",
        "princess",
        "football",
        "shadow",
        "sunshine",
        "trustno1",
        "iloveyou",
      ]);
      if (COMMON_PASSWORDS.has(password.toLowerCase())) {
        fail("That password is too common. Please choose a stronger one.");
        return;
      }
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
        // Only a real 429 blocks the attempt. Anything else means the gate
        // itself is unhealthy; blocking here made sign-in depend on
        // rate-limit infrastructure and took the whole login down with it.
        console.warn(
          `Login intent gate returned HTTP ${gateResponse.status}; continuing.`
        );
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
        const { createUserProfile } =
          await import("@/features/users/services/userProfile");
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

      await finishSignIn(user);
    } catch (error: unknown) {
      if (await beginSecondFactor(error)) {
        setLoading(false);
        return;
      }

      console.error("Email auth failed:", error);
      const err = error as { code?: string };
      if (err.code === "auth/user-not-found") {
        fail("No account found with that email.");
      } else if (
        err.code === "auth/wrong-password" ||
        err.code === "auth/invalid-credential"
      ) {
        fail("Incorrect email or password.");
      } else if (err.code === "auth/email-already-in-use") {
        fail("That email is already registered.");
        setIsRegister(false);
      } else if (err.code === "auth/weak-password") {
        fail("Password is too weak. Try a longer one.");
      } else if (err.code?.includes("app-check")) {
        console.error(
          "[auth] App Check is enforced on Identity Toolkit and the web client has no valid token. In Firebase Console → App Check → APIs, set Identity Toolkit / Identity Platform to Unenforced (or register the web app with a reCAPTCHA v3 key)."
        );
        fail(
          "Sign-in is blocked by Firebase App Check for this project. An administrator must disable App Check enforcement on Identity Toolkit, or register this web app in App Check."
        );
      } else {
        fail("Unable to sign in. Please try again.");
      }
      setLoading(false);
    }
  }

  return (
    <>
      {googlePending && <SigningInOverlay />}
      <main className={`login ${display.variable}`}>
      <aside className="login__brand">
        <div className="login__art" aria-hidden="true" />
        <div className="login__brandbody">
          <Logo />
          <p className="login__tag">
            Your global freight, simplified. Buy from any Indian store — we
            inspect, pack and forward it to your address.
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

        <div className="login__card">
          <Logo small />

          <motion.div
            custom={0}
            variants={fadeUp}
            initial="hidden"
            animate="show"
          >
            <h1 className="login__title">
              {isRegister ? "Create account" : "Sign in"}
            </h1>
            <p className="login__sub">
              {isRegister
                ? "Create a ShipIN account to track your international shipments."
                : "Welcome back! Please sign in to continue."}
            </p>
          </motion.div>

          {formError && (
            <p className="login__error" role="alert" id="login-error">
              {formError}
              {formErrorHelp && (
                <>
                  {" "}
                  <a
                    href={formErrorHelp.href}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="login__error-link"
                  >
                    {formErrorHelp.label}
                  </a>
                </>
              )}
            </p>
          )}

          {!mfaChallenge && (
            <>
              <motion.div
                custom={1}
                variants={fadeUp}
                initial="hidden"
                animate="show"
              >
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
                      <svg
                        className="h-5 w-5 shrink-0"
                        viewBox="0 0 24 24"
                        aria-hidden="true"
                      >
                        <path
                          fill="#4285F4"
                          d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                        />
                        <path
                          fill="#34A853"
                          d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                        />
                        <path
                          fill="#FBBC05"
                          d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                        />
                        <path
                          fill="#EA4335"
                          d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                        />
                      </svg>
                      Continue with Google
                    </>
                  )}
                </button>

                <div className="login__divider" role="separator">
                  <span>or</span>
                </div>
              </motion.div>

              <motion.div
                custom={2}
                variants={fadeUp}
                initial="hidden"
                animate="show"
              >
                <form
                  className="login__email-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (isRegister && !acceptedPolicies) {
                      setFormError(
                        "Confirm you are 18 or older and accept the Terms, Privacy Policy and Refund Policy."
                      );
                      return;
                    }
                    handleEmailAuth();
                  }}
                >
                  <label className="login__field">
                    <span className="login__label">Email address</span>
                    <input
                      type="email"
                      className="login__input"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="hello@example.com"
                      autoComplete="email"
                      disabled={loading}
                      aria-invalid={formError ? true : undefined}
                      aria-describedby={formError ? "login-error" : undefined}
                      required
                    />
                  </label>

                  <div className="login__field">
                    <div className="login__labelrow">
                      <label className="login__label" htmlFor="login-password">
                        Password
                      </label>
                      {!isRegister && (
                        <button
                          type="button"
                          className="login__link login__forgot"
                          onClick={handleForgotPassword}
                          disabled={loading}
                        >
                          Forgot password?
                        </button>
                      )}
                    </div>
                    <div className="login__inputwrap">
                      <input
                        id="login-password"
                        type={showPassword ? "text" : "password"}
                        className="login__input login__input--password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Enter your password"
                        autoComplete={
                          isRegister ? "new-password" : "current-password"
                        }
                        disabled={loading}
                        aria-invalid={formError ? true : undefined}
                        aria-describedby={formError ? "login-error" : undefined}
                        required
                      />
                      <button
                        type="button"
                        className="login__eye"
                        onClick={() => setShowPassword((v) => !v)}
                        aria-label={
                          showPassword ? "Hide password" : "Show password"
                        }
                        aria-pressed={showPassword}
                        disabled={loading}
                      >
                        {showPassword ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </div>

                  {isRegister && (
                    <label className="login__consent">
                      <input
                        type="checkbox"
                        checked={acceptedPolicies}
                        onChange={(e) => setAcceptedPolicies(e.target.checked)}
                        disabled={loading}
                        required
                      />
                      <span>
                        I am 18 or older and I accept the{" "}
                        <a href="/terms">Terms of Service</a>,{" "}
                        <a href="/privacy-policy">Privacy Policy</a> and{" "}
                        <a href="/refund-policy">Refund Policy</a>.
                      </span>
                    </label>
                  )}

                  <button
                    type="submit"
                    className="login__continue"
                    disabled={loading}
                  >
                    {loading ? (
                      <>
                        <span className="login__spin login__spin--light" />
                        {isRegister ? "Creating account..." : "Signing in..."}
                      </>
                    ) : isRegister ? (
                      "Create account"
                    ) : (
                      "Continue"
                    )}
                  </button>
                </form>

                <p className="login__switch">
                  {isRegister ? (
                    <>
                      Already have an account?{" "}
                      <button
                        type="button"
                        className="login__link"
                        onClick={() => setIsRegister(false)}
                      >
                        Sign in
                      </button>
                    </>
                  ) : (
                    <>
                      Don&apos;t have an account?{" "}
                      <button
                        type="button"
                        className="login__link"
                        onClick={() => setIsRegister(true)}
                      >
                        Sign up
                      </button>
                    </>
                  )}
                </p>

                {isRegister && (
                  <p className="login__terms">
                    We ask for a name and email only. You can delete your
                    account and data at any time under Settings → Your data.
                  </p>
                )}
              </motion.div>

              <p className="login__legal">
                © ShipIN · <a href="/privacy-policy">Privacy</a> ·{" "}
                <a href="/terms">Terms</a>
              </p>
            </>
          )}

          {mfaChallenge && (
            <motion.div
              custom={0}
              variants={fadeUp}
              initial="hidden"
              animate="show"
              className="login__field"
            >
              <h2 className="login__title" style={{ fontSize: "1.1rem" }}>
                Enter your SMS code
              </h2>
              <p className="login__sub">
                We sent a 6-digit code to{" "}
                {mfaChallenge.phoneNumber ?? "your enrolled phone"}.
              </p>

              <form onSubmit={verifySecondFactor} className="login__form">
                <label className="login__field">
                  <span className="login__label">Verification code</span>
                  <input
                    className="login__input"
                    value={mfaCode}
                    onChange={(event) => setMfaCode(event.target.value)}
                    placeholder="123456"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    disabled={mfaBusy}
                    required
                  />
                </label>

                <button
                  type="submit"
                  className="login__google"
                  disabled={mfaBusy || mfaCode.trim().length < 6}
                >
                  {mfaBusy ? (
                    <>
                      <span className="login__spin" />
                      Verifying...
                    </>
                  ) : (
                    "Verify and sign in"
                  )}
                </button>
              </form>

              {mfaError ? (
                <p className="login__error" role="alert">
                  {mfaError}
                </p>
              ) : null}

              <button
                type="button"
                className="login__link"
                onClick={() => {
                  setMfaChallenge(null);
                  setMfaCode("");
                  setMfaError("");
                }}
              >
                Use a different account
              </button>

              <div id={RECAPTCHA_CONTAINER_ID} />
            </motion.div>
          )}
        </div>
      </section>
    </main>
    </>
  );
}
