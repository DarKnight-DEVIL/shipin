"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { onAuthStateChanged, sendEmailVerification, reload } from "firebase/auth";
import { useEffect } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, CheckCircle2, Loader2, Mail, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { auth } from "@/lib/firebase";
import { clientEnv } from "@/config/env";
import "./verify-email.css";

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
  const [polling, setPolling] = useState(true);

  useEffect(() => {
    let mounted = true;
    let pollTimer: ReturnType<typeof setInterval> | null = null;

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!mounted) return;

      if (!user) {
        router.replace("/login");
        return;
      }

      setEmail(user.email ?? null);

      if (user.emailVerified) {
        setVerified(true);
        setPolling(false);
        if (pollTimer) clearInterval(pollTimer);
        return;
      }

      setPolling(true);
      if (pollTimer) clearInterval(pollTimer);
      pollTimer = setInterval(async () => {
        if (!mounted) return;
        const currentUser = auth.currentUser;
        if (!currentUser) return;
        try {
          await reload(currentUser);
          if (auth.currentUser?.emailVerified) {
            setVerified(true);
            setPolling(false);
            if (pollTimer) clearInterval(pollTimer);
          }
        } catch (error) {
          console.error("Verification poll failed:", error);
        }
      }, 5000);
    });

    return () => {
      mounted = false;
      if (pollTimer) clearInterval(pollTimer);
      unsubscribe();
    };
  }, [router]);

  async function handleResend() {
    const user = auth.currentUser;
    if (!user || user.emailVerified) return;
    setSending(true);
    try {
      await sendEmailVerification(user, {
        url: `${clientEnv.NEXT_PUBLIC_APP_URL ?? ""}/verify-email`,
      });
      toast.success("Verification email sent. Please check your inbox.");
    } catch (error: any) {
      console.error("Resend verification failed:", error);
      if (error.code === "auth/too-many-requests") {
        toast.error("Too many attempts. Please wait a moment and try again.");
      } else {
        toast.error("Could not send verification email. Please try again.");
      }
    } finally {
      setSending(false);
    }
  }

  async function handleContinue() {
    const user = auth.currentUser;
    if (user && user.emailVerified) {
      router.replace("/dashboard");
      router.refresh();
    } else {
      toast.error("Please verify your email first.");
    }
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

              <div className="verify__actions">
                <button
                  type="button"
                  onClick={handleResend}
                  disabled={sending}
                  className="verify__btn verify__btn--ghost"
                >
                  {sending ? (
                    <>
                      <Loader2 className="verify__spin" />
                      Sending...
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