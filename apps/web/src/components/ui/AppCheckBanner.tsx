"use client";

/**
 * Banner shown when an API call was rejected by App Check.
 *
 * Those rejections are attestation failures, not user mistakes, so a toast that
 * says "something went wrong" gives the user nothing to act on. This banner
 * says what happened and offers the three things a blocked device needs:
 *
 * - **Retry**, which reloads the page and requests a fresh App Check token
 *   (the forced-token retry inside `apiFetch` has already failed by the time
 *   this renders).
 * - **Contact support**, for the devices that stay blocked — a browser with
 *   reCAPTCHA disabled, a locked-down corporate profile, an out-of-date client.
 * - **Dismiss**, because a banner fixed to the top of the screen with no way out
 *   is worse than the error it describes. Dismissing hides it for this problem
 *   only: the next rejection brings it back.
 *
 * It renders nothing until `apiFetch` reports a rejection, and disappears on its
 * own as soon as a later request succeeds.
 */

import Link from "next/link";
import { useEffect, useState } from "react";

import {
  dismissAppCheckFailure,
  isAppCheckBannerVisible,
  subscribeAppCheckFailure,
} from "@/lib/appCheckFailure";

export interface AppCheckBannerProps {
  /**
   * Retry action. Defaults to reloading the page: the blocked request is
   * usually page data, and a reload re-runs it with a new App Check token.
   */
  onRetry?: () => void;
  /**
   * Where "Contact support" points. The admin shell overrides it with the admin
   * support centre; everywhere else the platform support page is right.
   */
  supportHref?: string;
}

export default function AppCheckBanner({
  onRetry,
  supportHref = "/support",
}: AppCheckBannerProps) {
  const [visible, setVisible] = useState(isAppCheckBannerVisible);

  useEffect(
    () => subscribeAppCheckFailure(() => setVisible(isAppCheckBannerVisible())),
    []
  );

  if (!visible) return null;

  const retry = onRetry ?? (() => window.location.reload());

  return (
    <div
      role="alert"
      aria-atomic="true"
      className="fixed inset-x-0 top-0 z-[60] flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-b border-amber-400/40 bg-[#3a2a05] px-4 py-2.5 text-sm text-amber-50"
    >
      <span>
        <strong className="font-semibold">Security check failed.</strong>{" "}
        This device could not be verified, so the request was blocked.
      </span>
      <Link
        href={supportHref}
        className="text-xs font-semibold text-amber-200 underline underline-offset-2 hover:text-amber-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300"
      >
        Contact support
      </Link>
      <button
        type="button"
        onClick={retry}
        className="rounded-md border border-amber-300/50 px-3 py-1 text-xs font-semibold text-amber-50 hover:bg-amber-300/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300"
      >
        Retry
      </button>
      <button
        type="button"
        onClick={() => dismissAppCheckFailure()}
        className="rounded-md px-2 py-1 text-xs font-medium text-amber-200/80 hover:text-amber-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300"
      >
        Dismiss
      </button>
    </div>
  );
}
