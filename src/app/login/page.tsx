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

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [loading, setLoading] =
    useState(false);

  const requestedNext =
    searchParams.get("next");

  const destination =
    requestedNext?.startsWith("/") &&
    !requestedNext.startsWith("//")
      ? requestedNext
      : "/dashboard";

  async function handleGoogleLogin() {
    try {
      setLoading(true);

      const provider =
        new GoogleAuthProvider();

      const result =
        await signInWithPopup(
          auth,
          provider
        );

      console.log(
        "Login successful:",
        result.user.email
      );

      /*
       * Firebase authentication has
       * completed at this point.
       */
      router.push(destination);

      /*
       * Force Next.js to refresh
       * server/client state after auth.
       */
      router.refresh();
    } catch (error) {
      console.error(
        "Google login failed:",
        error
      );

      alert(
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