import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { clientEnv } from "@/config/env";

// Lazily-initialized Firebase client — avoids triggering client env validation
// at module import time (which happens during build-time page data collection
// for server routes that don't actually need the client SDK).
let app: ReturnType<typeof initializeApp> | null = null;
let _auth: ReturnType<typeof getAuth> | null = null;
let _db: ReturnType<typeof getFirestore> | null = null;

function ensureFirebase() {
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
    _db = getFirestore(app);
  }
  return app;
}

export function getFirebaseAuth() {
  ensureFirebase();
  return _auth!;
}

export function getFirebaseDb() {
  ensureFirebase();
  return _db!;
}

// Lazy getters that initialize on first access
export const auth = new Proxy({} as ReturnType<typeof getAuth>, {
  get(_target, prop, receiver) {
    const a = getFirebaseAuth();
    const value = Reflect.get(a, prop, receiver);
    return typeof value === "function" ? value.bind(a) : value;
  },
});

export const db = new Proxy({} as ReturnType<typeof getFirestore>, {
  get(_target, prop, receiver) {
    const d = getFirebaseDb();
    const value = Reflect.get(d, prop, receiver);
    return typeof value === "function" ? value.bind(d) : value;
  },
});

export default new Proxy({} as ReturnType<typeof initializeApp>, {
  get(_target, prop, receiver) {
    const a = ensureFirebase();
    const value = Reflect.get(a, prop, receiver);
    return typeof value === "function" ? value.bind(a) : value;
  },
});
