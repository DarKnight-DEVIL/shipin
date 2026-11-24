/**
 * Google Identity Services (GIS) — the in-page credential flow for Google
 * sign-in.
 *
 * The redirect flow (`signInWithRedirect`) costs 2-3 seconds per attempt:
 * the SDK runs origin validation, the auth iframe re-checks the project
 * config and `createAuthUri`, and only then navigates to Google — three
 * sequential round-trips that read as "broken" to users and invite
 * double-clicks. GIS instead returns a Google ID token to an in-page
 * callback, which `signInWithCredential` exchanges without ever leaving the
 * page: sub-second sign-in, no handshake, no popup, no COOP.
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
  }): void;
  /**
   * Shows the One Tap / FedCM account chooser. The callback reports whether
   * the prompt was actually shown — a skipped or suppressed prompt (no
   * Google session, previous dismissal cooldown) means the caller must fall
   * back to the redirect flow.
   */
  prompt(callback?: (notification: {
    isNotDisplayed(): boolean;
    isSkippedMoment(): boolean;
    isDisplayed(): boolean;
    isDismissedMoment(): boolean;
  }) => void): void;
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

export interface GoogleSignInPrompt {
  /** Fires with the Google ID token when the user picks an account. */
  onCredential: (credential: string) => void;
  /** Fires when the prompt could not or would not be shown. */
  onUnavailable: () => void;
  /** Fires when the prompt was shown but the user closed it. */
  onDismissed: () => void;
}

/**
 * Initializes GIS with the credential callback and shows the account chooser.
 *
 * `onUnavailable` fires when One Tap cannot display (no Google session in the
 * browser, dismissal cooldown, FedCM refusal) — the sign-in then needs the
 * redirect fallback. It also fires when GIS itself fails to load.
 */
export function promptGoogleSignIn(
  clientId: string,
  { onCredential, onUnavailable, onDismissed }: GoogleSignInPrompt
): void {
  loadGoogleIdentity()
    .then((api) => {
      api.initialize({
        client_id: clientId,
        callback: (response) => onCredential(response.credential),
        // FedCM is the browser-native account chooser: it needs no third-party
        // cookies, which Chrome partitions away — the same class of breakage
        // that killed the popup flow.
        use_fedcm_for_prompt: true,
      });
      api.prompt((notification) => {
        if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
          onUnavailable();
        } else if (notification.isDismissedMoment()) {
          onDismissed();
        }
      });
    })
    .catch(onUnavailable);
}
