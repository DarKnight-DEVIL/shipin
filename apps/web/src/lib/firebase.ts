import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import type { AppCheck } from "firebase/app-check";

import { clientEnv } from "@/config/env";

/**
 * Firebase client app + auth.
 *
 * Firestore deliberately lives in `./firebaseDb`: this module is imported by
 * the root layout (through the auth redirect handler) and by every page that
 * only needs a session, and a single static import of `firebase/firestore`
 * here would ship the whole Firestore SDK (~170 KB gzip) to every route,
 * including the public landing, tracking and login pages.
 *
 * Initialization stays lazy so build-time page-data collection, which imports
 * server routes that never touch the client SDK, does not validate client env.
 */
let app: FirebaseApp | null = null;
let _auth: Auth | null = null;
let appCheck: AppCheck | null = null;
let appCheckInit: Promise<void> | null = null;
let readAppCheckToken:
  | ((instance: AppCheck, forceRefresh?: boolean) => Promise<{ token: string }>)
  | null = null;

/**
 * Start Firebase App Check with reCAPTCHA v3.
 *
 * Loaded through a dynamic import on purpose: the SDK is only needed once a
 * browser session exists, and a static import would pull it into the landing
 * page bundle for visitors who never sign in.
 *
 * App Check must be initialized before the first Auth request, otherwise that
 * request carries no token and is rejected while the project enforces App
 * Check. `ensureFirebaseApp` therefore starts this as soon as the app is
 * created, and the Auth views only mount after that.
 */
function startAppCheck(firebaseApp: FirebaseApp): void {
  if (typeof window === "undefined" || appCheckInit) return;

  const siteKey = clientEnv.NEXT_PUBLIC_FIREBASE_APP_CHECK_SITE_KEY;

  if (!siteKey) {
    if (clientEnv.NODE_ENV === "production") {
      console.warn(
        "[app-check] NEXT_PUBLIC_FIREBASE_APP_CHECK_SITE_KEY is not set. " +
          "Sign-in and API calls will fail while this Firebase project enforces App Check."
      );
    }
    return;
  }

  appCheckInit = import("firebase/app-check")
    .then(({ initializeAppCheck, ReCaptchaV3Provider, getToken }) => {
      readAppCheckToken = getToken;

      if (clientEnv.NEXT_PUBLIC_FIREBASE_APP_CHECK_DEBUG === "true") {
        // Must be assigned before initializeAppCheck: the SDK then exchanges a
        // locally generated debug token instead of calling reCAPTCHA. The token
        // still has to be registered under App Check → Debug tokens.
        (self as unknown as Record<string, unknown>).FIREBASE_APPCHECK_DEBUG_TOKEN = true;
      }

      appCheck = initializeAppCheck(firebaseApp, {
        provider: new ReCaptchaV3Provider(siteKey),
        // Refresh in the background so a long-lived tab never sends a stale token.
        isTokenAutoRefreshEnabled: true,
      });
    })
    .catch((error: unknown) => {
      // A failed init must not break sign-in: the request still goes out and
      // either succeeds (enforcement off) or fails with a clear App Check error.
      appCheckInit = null;
      console.error(
        "[app-check] Initialization failed; requests will be rejected while enforcement is on:",
        error
      );
    });
}

/**
 * The current App Check token, or null when App Check is not configured.
 *
 * Sent as `X-Firebase-AppCheck` on every API call so the server can verify it:
 * the Admin SDK bypasses Firebase's own enforcement, so nothing else would.
 */
/**
 * Read the App Check token, or null when App Check is not configured.
 *
 * `forceRefresh` asks the SDK to mint a new token instead of returning the one
 * it cached. A cached token can be the very reason a request was rejected —
 * expired, or issued before the device's attestation changed — so the retry
 * path passes true once before giving up.
 */
export async function getAppCheckToken(
  forceRefresh = false
): Promise<string | null> {
  if (!appCheckInit) return null;

  await appCheckInit;
  if (!appCheck || !readAppCheckToken) return null;

  try {
    const { token } = await readAppCheckToken(appCheck, forceRefresh);
    return token || null;
  } catch (error) {
    console.error("[app-check] Could not obtain a token:", error);
    return null;
  }
}

/** Initializes the client app once and returns it with its auth instance. */
export function ensureFirebaseApp(): { app: FirebaseApp; auth: Auth } {
  if (app === null) {
    const firebaseConfig = {
      apiKey: clientEnv.NEXT_PUBLIC_FIREBASE_API_KEY,
      authDomain: clientEnv.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
      projectId: clientEnv.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      storageBucket: clientEnv.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: clientEnv.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
      appId: clientEnv.NEXT_PUBLIC_FIREBASE_APP_ID,
    };
    app = getApps().length ? getApp() : initializeApp(firebaseConfig);
    _auth = getAuth(app);
    startAppCheck(app);
  }

  // Both are assigned together above; this narrows them for callers.
  if (!app || !_auth) {
    throw new Error("Firebase client failed to initialize.");
  }

  return { app, auth: _auth };
}

export const getFirebaseAuth = () => ensureFirebaseApp().auth;

export const auth: Auth = ensureFirebaseApp().auth;
