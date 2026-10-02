"use client";

import { useState } from "react";
import {
  useRouter,
  useSearchParams,
} from "next/navigation";

import {
  GoogleAuthProvider,
  signInWithPopup,
} from "firebase/auth";

import { auth } from "@/lib/firebase";
import { getUserProfile } from "@/lib/userProfile";
import { toast } from "sonner";

export default function LoginClient() {
  const router = useRouter();
  const searchParams =
    useSearchParams();

  const [loading, setLoading] =
    useState(false);

  const requestedNext =
    searchParams.get("next");

  /*
   * Only allow internal routes.
   *
   * Prevents things such as:
   * /login?next=https://malicious-site.com
   */
  const safeRequestedNext =
    requestedNext?.startsWith("/") &&
    !requestedNext.startsWith("//")
      ? requestedNext
      : null;

  async function handleGoogleLogin() {
    try {
      setLoading(true);

      /*
       * ========================================
       * GOOGLE SIGN IN
       * ========================================
       */

      const provider =
        new GoogleAuthProvider();

      const result =
        await signInWithPopup(
          auth,
          provider
        );

      const user =
        result.user;

      /*
       * ========================================
       * GET USER PROFILE
       * ========================================
       */

      const profile =
        await getUserProfile(
          user.uid
        );

      /*
       * ========================================
       * DETERMINE DESTINATION
       * ========================================
       *
       * Admins go to the admin dashboard.
       *
       * Normal customers go to the
       * customer dashboard.
       */

      if (
        profile?.role === "admin"
      ) {
        /*
         * If an admin was explicitly trying
         * to reach another internal page,
         * respect that destination.
         *
         * Otherwise send them to admin dashboard.
         */
        const destination =
          safeRequestedNext ||
          "/admin/dashboard";

        router.replace(
          destination
        );
      } else {
        /*
         * Customers should never be
         * automatically sent to /admin/*
         * through the login redirect.
         */

        const customerDestination =
          safeRequestedNext &&
          !safeRequestedNext.startsWith(
            "/admin"
          )
            ? safeRequestedNext
            : "/dashboard";

        router.replace(
          customerDestination
        );
      }

      router.refresh();
    } catch (error) {
      console.error(
        "Google login failed:",
        error
      );

      toast.error(
        "Unable to sign in with Google."
      );

      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 text-white flex items-center justify-center px-4">
      <div className="bg-slate-900 p-10 rounded-2xl border border-slate-800 w-full max-w-[400px]">
        <h1 className="text-3xl font-bold mb-2 text-center">
          Ship
          <span className="text-purple-400">
            IN
          </span>
        </h1>

        <p className="text-slate-400 text-center mb-8">
          Sign in to manage your shopping
          requests and shipments.
        </p>

        <button
          type="button"
          onClick={handleGoogleLogin}
          disabled={loading}
          className="w-full bg-white text-black py-3 rounded-xl font-semibold hover:bg-gray-200 transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading
            ? "Signing in..."
            : "Continue with Google"}
        </button>
      </div>
    </main>
  );
}