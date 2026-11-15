"use client";

import { useCallback, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { onAuthStateChanged, sendEmailVerification, reload } from "firebase/auth";
import { useEffect } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, CheckCircle2, Loader2, Mail, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { auth } from "@/lib/firebase";
import {
  RESEND_COOLDOWN_MS,
  isRateLimitedResend,
  refreshVerifiedToken,
  resendVerificationErrorMessage,
  verificationEmailOptions,
} from "@/lib/emailVerification";
import "@/styles/verify-email.css";

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: 0.08 + i * 0.08, duration: 0.5, ease: [0.22, 1, 0.36, 1] as const },
  }),
};

export default function VerifyEmailClient() {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [verified, setVerified] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [polling, setPolling] = useState(true);
  // Set only after Firebase rate-limits a resend. Clicking again immediately
  // just fails again, so the button is held shut for a minute and says why.
  const [cooldownUntil, setCooldownUntil] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  // A ref, not an effect-local variable, so every exit path can stop the poll:
  // unmount, a successful verification, a sign-out, or a navigation this
  // component initiates. An interval that outlives the decision to leave fires
  // a reload() against a page the user has already left.
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollTimerRef.current !== null) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    setPolling(false);
  }, []);

  useEffect(() => {
    let mounted = true;

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!mounted) return;

      if (!user) {
        // Signed out: stop before the redirect, so no tick survives it.
        stopPolling();
        router.replace("/login");
        return;
      }

      setEmail(user.email ?? null);

      if (user.emailVerified) {
        // The cached ID token still carries email_verified:false for up to an
        // hour. Refresh it here so the first dashboard request is accepted
        // instead of coming back 403 EMAIL_VERIFICATION_REQUIRED.
        await refreshVerifiedToken(user);
        if (!mounted) return;
        setVerified(true);
        stopPolling();
        return;
      }

      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
      setPolling(true);
      pollTimerRef.current = setInterval(async () => {
        if (!mounted) return;
        const currentUser = auth.currentUser;
        if (!currentUser) return;
        try {
          await reload(currentUser);
          if (auth.currentUser?.emailVerified) {
            await refreshVerifiedToken(auth.currentUser);
            if (!mounted) return;
            setVerified(true);
            stopPolling();
          }
        } catch (error) {
          console.error("Verification poll failed:", error);
        }
      }, 5000);
    });

    return () => {
      mounted = false;
      stopPolling();
      unsubscribe();
    };
  }, [router, stopPolling]);

  useEffect(() => {
    if (cooldownUntil === null) return;

    const id = setInterval(() => {
      if (Date.now() >= cooldownUntil) {
        setCooldownUntil(null);
      }
      setNow(Date.now());
    }, 250);

    return () => clearInterval(id);
  }, [cooldownUntil]);

  const cooldownSeconds =
    cooldownUntil === null
      ? 0
      : Math.max(0, Math.ceil((cooldownUntil - now) / 1000));
  const coolingDown = cooldownSeconds > 0;

  async function handleResend() {
    const user = auth.currentUser;
    if (!user || user.emailVerified) return;
    // Belt and braces: the button is disabled, but a stale handler or an
    // Enter key must not slip a doomed request past the cooldown either.
    if (coolingDown) return;
    setSending(true);
    setSendError(null);
    try {
      // Only pass a continue URL when it is an absolute http(s) URL: Firebase
      // rejects a relative one with auth/invalid-continue-uri and sends no
      // email at all.
      await sendEmailVerification(user, verificationEmailOptions());
      toast.success("Verification email sent. Please check your inbox.");
    } catch (error) {
      // The console entry is for diagnosis; the message below is what the user
      // sees. A toast alone was too easy to miss next to the "Check your email"
      // heading, so the failure is reported inline where the button lives.
      console.error("Resend verification failed:", error);
      setSendError(resendVerificationErrorMessage(error));

      if (isRateLimitedResend(error)) {
        setNow(Date.now());
        setCooldownUntil(Date.now() + RESEND_COOLDOWN_MS);
      }
    } finally {
      setSending(false);
    }
  }

  async function handleContinue() {
    const user = auth.currentUser;

    if (!user) {
      toast.error("Please sign in again.");
      return;
    }

    // The verification link may have been opened in another tab, so press this
    // button only reflecting stale client state. Reload before refusing.
    if (!user.emailVerified) {
      try {
        await reload(user);
      } catch (error) {
        console.error("Verification reload failed:", error);
      }
    }

    if (!user.emailVerified) {
      toast.error("Please verify your email first.");
      return;
    }

    await refreshVerifiedToken(user);
    // Stop before navigating: the interval must not tick between the replace
    // and the unmount, which would send a request for a page being left.
    stopPolling();
    router.replace("/dashboard");
    router.refresh();
  }

  return (
    <main className="verify">
      <div className="verify__inner">
        <Link href="/" className="verify__back">
          <ArrowLeft className="h-4 w-4" />
          Back to home
        </Link>

        <motion.div custom={0} variants={fadeUp} initial="hidden" animate="show" className="verify__card">
          {verified ? (
            <>
              <div className="verify__icon verify__icon--ok">
                <CheckCircle2 className="h-10 w-10" />
              </div>
              <h1 className="verify__title">Email verified!</h1>
              <p className="verify__sub">
                Your email address has been confirmed. You can now access your account.
              </p>
              <button type="button" onClick={handleContinue} className="verify__btn">
                Continue to dashboard
              </button>
            </>
          ) : (
            <>
              <div className="verify__icon">
                <Mail className="h-10 w-10" />
              </div>
              <h1 className="verify__title">Check your email</h1>
              <p className="verify__sub">
                We sent a verification link to{" "}
                <strong className="verify__email">{email ?? "your email"}</strong>. Click the link in the email to verify your account.
              </p>

              {polling && (
                <p className="verify__poll">
                  <Loader2 className="verify__spin" />
                  Waiting for verification...
                </p>
              )}

              {sendError && (
                <p className="verify__alert" role="alert" aria-live="assertive">
                  {sendError}
                </p>
              )}

              <div className="verify__actions">
                <button
                  type="button"
                  onClick={handleResend}
                  disabled={sending || coolingDown}
                  className="verify__btn verify__btn--ghost"
                >
                  {sending ? (
                    <>
                      <Loader2 className="verify__spin" />
                      Sending...
                    </>
                  ) : coolingDown ? (
                    <>
                      <RefreshCw className="h-4 w-4" />
                      Try again in {cooldownSeconds}s
                    </>
                  ) : (
                    <>
                      <RefreshCw className="h-4 w-4" />
                      Resend email
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={handleContinue}
                  className="verify__btn"
                >
                  I verified my email
                </button>
              </div>

              <p className="verify__footer">
                Already verified?{" "}
                <button type="button" className="verify__link" onClick={handleContinue}>
                  Continue
                </button>
              </p>
            </>
          )}
        </motion.div>
      </div>
    </main>
  );
}