"use client";

/**
 * Inline notice shown while a request is backing off before its retry.
 *
 * Deliberately not a toast and not a spinner: the retry usually succeeds, and a
 * toast for it would be noise. What the user needs is a quiet statement that
 * the page is still working, so a two-second gateway hiccup doesn't read as a
 * frozen screen.
 *
 * Rendered in the page flow (not fixed) so it cannot collide with the App Check
 * banner, and marked `role="status"` with `aria-live="polite"` so a screen
 * reader announces it without interrupting.
 */

import { useEffect, useState } from "react";

import {
  isRetryPending,
  subscribeRetryNotice,
} from "@/lib/requestRetry";

export default function RetryNotice() {
  const [pending, setPending] = useState(isRetryPending);

  useEffect(
    () => subscribeRetryNotice(() => setPending(isRetryPending())),
    []
  );

  if (!pending) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="mx-auto mb-4 flex w-full max-w-xl items-center justify-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-900 dark:text-amber-100"
    >
      <span
        aria-hidden="true"
        className="h-3 w-3 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent"
      />
      <span>Connection hiccup — retrying…</span>
    </div>
  );
}
