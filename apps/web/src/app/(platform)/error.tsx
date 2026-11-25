"use client";

/**
 * Customer-platform error boundary (dashboard, requests, wallet, settings…).
 *
 * `/admin` has had its own boundary since the console shipped; the customer
 * side did not, so a throw in any of these pages unwound past the platform
 * shell to `src/app/error.tsx`, which replaces the whole frame — the signed-in
 * navigation disappears and the only way out is a reload. Keeping the boundary
 * here means one broken panel degrades to a panel.
 *
 * Deliberately reachable by a signed-out visitor too: every page under
 * `(platform)` prerenders signed out, so the boundary must not assume a session.
 */

import { useEffect } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";

export default function PlatformError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // The digest is the only handle on the server-side stack; log it, not the
    // message, which can contain customer data from a failed render.
    console.error("[platform] Page error:", {
      name: error.name,
      digest: error.digest,
    });
  }, [error]);

  return (
    <div className="mx-auto max-w-2xl px-6 py-16">
      <div
        role="alert"
        className="rounded-2xl border border-orange-500/40 bg-orange-500/10 p-8"
      >
        <div className="flex items-center gap-3">
          <AlertTriangle size={26} className="text-orange-400" />
          <h1 className="text-xl font-semibold">This page failed to load</h1>
        </div>

        <p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">
          The rest of your account is still available from the menu. Retry this
          page, or reload if it keeps failing.
        </p>

        {error.digest ? (
          <p className="mt-3 font-mono text-xs text-slate-500">
            digest: {error.digest}
          </p>
        ) : null}

        <button
          type="button"
          onClick={reset}
          className="mt-6 inline-flex items-center gap-2 rounded-xl bg-orange-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-orange-600"
        >
          <RotateCcw size={16} />
          Try again
        </button>
      </div>
    </div>
  );
}
