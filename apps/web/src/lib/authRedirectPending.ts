/**
 * Session flag marking a Google redirect sign-in that is still in flight.
 *
 * The redirect fallback leaves the page entirely; when the browser comes
 * back the login form would flash for a second before the sign-in completes,
 * which reads as "nothing happened" or "it failed". This flag lets the
 * return trip render a full-screen "Signing you in…" interstitial instead,
 * for exactly as long as the completion takes.
 */
const FLAG = "shipin:auth-redirect-pending";

export function markAuthRedirectPending(): void {
  try {
    sessionStorage.setItem(FLAG, "1");
  } catch {
    // Storage can be unavailable (private mode, blocked cookies); the
    // interstitial is a nicety, the sign-in itself does not need it.
  }
}

export function clearAuthRedirectPending(): void {
  try {
    sessionStorage.removeItem(FLAG);
  } catch {
    // Same best-effort contract as marking.
  }
}

export function isAuthRedirectPending(): boolean {
  try {
    return sessionStorage.getItem(FLAG) === "1";
  } catch {
    return false;
  }
}
