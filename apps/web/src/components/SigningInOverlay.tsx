"use client";

import { Loader2 } from "lucide-react";

/**
 * Full-screen interstitial shown while a Google sign-in is completing —
 * while the popup chooser is open, or while the browser is returning from
 * the redirect fallback. It replaces the "back on the same login page"
 * flash that read as a failed or stalled sign-in.
 */
export default function SigningInOverlay() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-background text-foreground"
    >
      <Loader2
        className="h-10 w-10 animate-spin text-[#ff6b1a]"
        aria-hidden="true"
      />
      <p className="text-lg font-semibold">Signing you in…</p>
      <p className="text-sm text-foreground/60">
        Taking you to your dashboard — this only takes a moment.
      </p>
    </div>
  );
}
