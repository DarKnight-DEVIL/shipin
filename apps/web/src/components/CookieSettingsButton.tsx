"use client";

import { requestConsentBanner } from "@/lib/consent";

/**
 * Footer control that reopens the cookie notice, so a choice made once is not
 * permanent. Rendered as a button because it performs an action, not navigation.
 */
export default function CookieSettingsButton({ className }: { className?: string }) {
  return (
    <button
      type="button"
      onClick={requestConsentBanner}
      className={className ?? "footer__link"}
    >
      Cookie settings
    </button>
  );
}
