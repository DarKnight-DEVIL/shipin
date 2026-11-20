"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  CONSENT_OPEN_EVENT,
  buildConsent,
  readConsent,
  writeConsent,
  type ConsentChoice,
} from "@/lib/consent";

/**
 * Cookie banner.
 *
 * The site sets no advertising or tracking cookies and the analytics are
 * cookieless, so this banner is a disclosure with a recorded answer rather than
 * a gate in front of content. Both answers are given equal weight and the same
 * styling on purpose — one big coloured "Accept" next to a grey "Decline" is the
 * textbook dark pattern, and the choice here has no effect on what loads.
 *
 * The decision is versioned (see `@/lib/consent`); changing the disclosure
 * re-asks instead of inheriting a stale "accepted". The footer's "Cookie
 * settings" control reopens it through `CONSENT_OPEN_EVENT`.
 */
export default function CookieBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // The decision is read here, not during render: localStorage does not exist
    // while the page is prerendered, and reading it in a state initializer would
    // make the first client render disagree with the server HTML. It is applied
    // on a timer rather than synchronously so the read cannot cascade a render
    // out of the effect (a person sees the banner one frame later at most).
    const applyStoredChoice = () => {
      if (!readConsent(window.localStorage)) setVisible(true);
    };
    const openTimer = window.setTimeout(applyStoredChoice, 0);

    const reopen = () => setVisible(true);
    window.addEventListener(CONSENT_OPEN_EVENT, reopen);

    return () => {
      window.clearTimeout(openTimer);
      window.removeEventListener(CONSENT_OPEN_EVENT, reopen);
    };
  }, []);

  if (!visible) return null;

  const decide = (choice: ConsentChoice) => {
    writeConsent(window.localStorage, buildConsent(choice));
    setVisible(false);
  };

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-50 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 shadow-lg"
      role="region"
      aria-label="Cookie and analytics notice"
    >
      <div className="max-w-4xl mx-auto px-4 py-4 sm:px-6 lg:px-8">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex-1">
            <h2 className="text-sm font-medium text-gray-900 dark:text-white">
              Cookies on ShipIN
            </h2>
            <p className="mt-1 text-sm text-gray-700 dark:text-gray-300">
              We set no advertising or tracking cookies. The only cookie is an
              essential admin security cookie; analytics is cookieless and
              aggregate. Your answer is stored on this device.{" "}
              <Link
                href="/cookie-policy"
                className="text-orange-700 dark:text-orange-300 hover:underline"
              >
                Cookie Policy
              </Link>{" "}
              ·{" "}
              <Link
                href="/privacy-policy"
                className="text-orange-700 dark:text-orange-300 hover:underline"
              >
                Privacy Policy
              </Link>
            </p>
          </div>
          <div className="flex gap-3 shrink-0">
            <button
              type="button"
              onClick={() => decide("declined")}
              className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-300 text-gray-800 dark:text-gray-200 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              Decline analytics notice
            </button>
            <button
              type="button"
              onClick={() => decide("accepted")}
              className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-300 text-gray-800 dark:text-gray-200 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              Acknowledge
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
