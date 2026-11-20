"use client";

/**
 * Admin console error boundary.
 *
 * Without this file a throw in any `/admin/**` page bubbles to the root
 * boundary, which replaces the whole app shell — including the sidebar the
 * operator needs to navigate away. Keeping the boundary inside `/admin` means
 * a single broken panel degrades to a panel.
 */

import { useEffect } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[Admin] Page error:", {
      name: error.name,
      digest: error.digest,
    });
  }, [error]);

  return (
    <div className="mx-auto max-w-2xl px-6 py-16">
      <div className="rounded-2xl border border-rose-500/40 bg-rose-500/10 p-8">
        <div className="flex items-center gap-3">
          <AlertTriangle size={26} className="text-rose-400" />
          <h1 className="text-xl font-semibold text-white">
            This console panel failed to load
          </h1>
        </div>

        <p className="mt-3 text-sm leading-6 text-slate-300">
          The rest of the admin area is still available from the sidebar. Retry
          the panel, or reload the page if it keeps failing.
        </p>

        {error.digest ? (
          <p className="mt-3 font-mono text-xs text-slate-500">
            digest: {error.digest}
          </p>
        ) : null}

        <button
          type="button"
          onClick={reset}
          className="mt-6 inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-sm font-semibold text-slate-900 transition hover:bg-slate-200"
        >
          <RotateCcw size={16} />
          Try again
        </button>
      </div>
    </div>
  );
}
