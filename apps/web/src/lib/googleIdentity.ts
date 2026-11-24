/**
 * Google Identity Services (GIS) — the in-page credential flow for Google
 * sign-in.
 *
 * One Tap is auto-prompted when the login page loads: the browser-native
 * (FedCM) chooser is then already on screen before the user reaches for the
 * button, and `auto_select` signs returning users in with zero clicks. The
 * "Continue with Google" button itself uses the classic popup flow — the two
 * choosers stay independent.
 *
 * The client ID is the Firebase-managed Google OAuth web client for this
 * project (a public identifier; it appears in every OAuth URL). It can be
 * overridden with NEXT_PUBLIC_GOOGLE_CLIENT_ID.
 */

export const FIREBASE_MANAGED_GOOGLE_CLIENT_ID =
  "1088532314053-ouofdgsbsot2obram3nqtb26pojqjp1j.apps.googleusercontent.com";

/** Minimal shape of the parts of `window.google.accounts.id` we use. */
interface GoogleIdApi {
  initialize(config: {
    client_id: string;
    callback: (response: { credential: string }) => void;
    /** Browser-native account chooser; no third-party cookies needed. */
    use_fedcm_for_prompt?: boolean;
    /** Reuse the account the user chose on a previous sign-in silently. */
    auto_select?: boolean;
  }): void;
  /**
   * Shows the One Tap / FedCM account chooser. The optional callback reports
   * display outcomes; the auto-prompt ignores them on purpose — when One Tap
   * cannot show (no Google session, dismissal cooldown), the popup button
   * and its redirect fallback remain the path in.
   */
  prompt(callback?: (notification: unknown) => void): void;
  cancel(): void;
  disableAutoSelect(): void;
}

declare global {
  interface Window {
    google?: { accounts: { id: GoogleIdApi } };
  }
}

let loadPromise: Promise<GoogleIdApi> | null = null;

/**
 * Loads the GIS client script once and resolves with the `google.accounts.id`
 * API. Rejects when the script cannot load (offline, blocked by an extension).
 */
export function loadGoogleIdentity(): Promise<GoogleIdApi> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("gsi-unavailable"));
  }
  const existing = window.google?.accounts?.id;
  if (existing) return Promise.resolve(existing);

  loadPromise ??= new Promise<GoogleIdApi>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = () => {
      const api = window.google?.accounts?.id;
      if (api) {
        resolve(api);
      } else {
        loadPromise = null;
        reject(new Error("gsi-missing-api"));
      }
    };
    script.onerror = () => {
      loadPromise = null;
      reject(new Error("gsi-load-failed"));
    };
    document.head.appendChild(script);
  });
  return loadPromise;
}

/**
 * Auto-prompts One Tap as the page loads, the way Google recommends One Tap
 * be used on sign-in pages. The chooser is then already on screen before the
 * user reaches for the button — the click-time FedCM round trip (fetch the
 * account list, ~0.5s) happens while the page is still loading instead.
 * Failures are silent: the popup button remains the path in.
 */
export function autoPromptGoogleSignIn(
  clientId: string,
  onCredential: (credential: string) => void
): void {
  loadGoogleIdentity()
    .then((api) => {
      api.initialize({
        client_id: clientId,
        callback: (response) => onCredential(response.credential),
        use_fedcm_for_prompt: true,
        auto_select: true,
      });
      api.prompt();
    })
    .catch(() => {});
}
