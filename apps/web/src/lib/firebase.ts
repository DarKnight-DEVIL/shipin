import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import { connectAuthEmulator, getAuth, type Auth } from "firebase/auth";
import type { AppCheck } from "firebase/app-check";

import { childLogger } from "@/lib/logger";

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
      const fbcLogger = childLogger({ service: "app-check" });
      fbcLogger.warn(
        "[app-check] NEXT_PUBLIC_FIREBASE_APP_CHECK_SITE_KEY is not set. " +
          "Sign-in and API calls will fail while this Firebase project enforces App Check."
      );
    }
    return;
  }

  appCheckInit = import("firebase/app-check")
    .then(({ initializeAppCheck, ReCaptchaEnterpriseProvider, getToken }) => {
      readAppCheckToken = getToken;

      if (clientEnv.NEXT_PUBLIC_FIREBASE_APP_CHECK_DEBUG === "true") {
        // Must be assigned before initializeAppCheck: the SDK then exchanges a
        // locally generated debug token instead of calling reCAPTCHA. The token
        // still has to be registered under App Check → Debug tokens.
        (
          self as unknown as Record<string, unknown>
        ).FIREBASE_APPCHECK_DEBUG_TOKEN = true;
      }

      appCheck = initializeAppCheck(firebaseApp, {
        // reCAPTCHA Enterprise, not classic v3: the project's key is an
        // Enterprise key, and the two are not interchangeable - a classic
        // provider exchanging an Enterprise key gets a 400 from the App Check
        // backend on every attempt, throttles, and blocks every enforced call.
        provider: new ReCaptchaEnterpriseProvider(siteKey),
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
      // Same-origin authDomain. The auth helper (/__/auth handler + iframe)
      // must be served from this app's own origin: on any other host the
      // browser partitions the helper's third-party storage and sign-in
      // results never reach the page (silent sign-out after the redirect
      // back from Google). next.config.ts proxies /__/auth to the real
      // helper on <project>.firebaseapp.com, so using the current host here
      // keeps the whole flow same-origin in every https deployment.
      // HTTPS-only on purpose: on http://localhost:3000 the hostname loses
      // the port, the SDK would target https://localhost (nothing there),
      // and local dev has no TLS anyway — dev keeps the configured domain.
      authDomain:
        typeof window !== "undefined" && window.location.protocol === "https:"
          ? window.location.hostname
          : clientEnv.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
      projectId: clientEnv.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      messagingSenderId: clientEnv.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
      appId: clientEnv.NEXT_PUBLIC_FIREBASE_APP_ID,
    };
    app = getApps().length ? getApp() : initializeApp(firebaseConfig);
    _auth = getAuth(app);

    // Local E2E only. Without this the sign-in specs need a real staging
    // account; with it they sign in against the Auth emulator, whose tokens the
    // Admin SDK also accepts (FIREBASE_AUTH_EMULATOR_HOST). Browser-only: the
    // emulator connection has no meaning in a server render.
    // Optional, and `undefined` at runtime when the build set no value: the
    // bundler leaves a runtime `process.env` read for it instead of inlining
    // the `''` default from `clientEnv`. See the same guard in `./firebaseDb`.
    const authEmulatorHost =
      clientEnv.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST?.trim() ?? "";
    if (authEmulatorHost && typeof window !== "undefined") {
      connectAuthEmulator(_auth, `http://${authEmulatorHost}`, {
        disableWarnings: true,
      });
    }

    startAppCheck(app);
  }

  // Both are assigned together above; this narrows them for callers.
  if (!app || !_auth) {
    throw new Error("Firebase client failed to initialize.");
  }

  return { app, auth: _auth };
}

export const getFirebaseAuth = () => ensureFirebaseApp().auth;

/**
 * Lazy `Auth` handle.
 *
 * Constructing the proxy does not touch Firebase, so importing this module no
 * longer initializes the client and validates every `NEXT_PUBLIC_*` variable at
 * module load. Build-time page-data collection and server routes that import
 * shared helpers stay free of client env; the first property access creates the
 * app.
 *
 * `_delegate` is special-cased because Firebase's public auth functions
 * normalize their argument with `auth._delegate ?? auth`; without it they would
 * keep operating on the proxy rather than the real instance.
 */
export const auth: Auth = new Proxy({} as Auth, {
  get(_target, property) {
    const instance = ensureFirebaseApp().auth;
    if (property === "_delegate") return instance;

    const value = (instance as unknown as Record<PropertyKey, unknown>)[
      property
    ];
    return typeof value === "function" ? value.bind(instance) : value;
  },
  set(_target, property, value) {
    (ensureFirebaseApp().auth as unknown as Record<PropertyKey, unknown>)[
      property
    ] = value;
    return true;
  },
  has(_target, property) {
    return property in (ensureFirebaseApp().auth as object);
  },
});
