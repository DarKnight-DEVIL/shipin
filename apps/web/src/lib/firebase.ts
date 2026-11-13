import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";

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
  }

  // Both are assigned together above; this narrows them for callers.
  if (!app || !_auth) {
    throw new Error("Firebase client failed to initialize.");
  }

  return { app, auth: _auth };
}

export const getFirebaseAuth = () => ensureFirebaseApp().auth;

export const auth: Auth = ensureFirebaseApp().auth;
