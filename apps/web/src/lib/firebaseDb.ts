import {
  connectFirestoreEmulator,
  getFirestore,
  type Firestore,
} from "firebase/firestore";

import { clientEnv } from "@/config/env";

import { ensureFirebaseApp } from "./firebase";

/**
 * Firestore client, kept in its own module so the SDK only reaches the bundles
 * that actually query data.
 *
 * `firebase/firestore` is a large static import; keeping it out of
 * `./firebase` is what stops the public landing, tracking and login pages from
 * downloading it. Import `db` from here, never from `@/lib/firebase`.
 */
let _db: Firestore | null = null;

/** Returns the Firestore client, initializing it once against the shared app. */
export function getFirebaseDb(): Firestore {
  if (_db === null) {
    const db = getFirestore(ensureFirebaseApp().app);

    // Local E2E only: point the client SDK at the emulator so the signed-in
    // specs read seeded documents instead of a real project. Browser-only; a
    // server render must never connect to a loopback datastore.
    //
    // The optional chaining is load-bearing. When a build has no value for this
    // variable the bundler leaves a runtime `process.env` read, so the browser
    // gets `undefined` rather than the `''` default in `clientEnv`. A bare
    // `.trim()` there threw during hydration on every page that opens
    // Firestore (`/requests`, `/settings`, `/support`).
    const emulatorHost =
      clientEnv.NEXT_PUBLIC_FIRESTORE_EMULATOR_HOST?.trim() ?? "";
    if (emulatorHost && typeof window !== "undefined") {
      const [host, port] = emulatorHost.split(":");
      connectFirestoreEmulator(db, host, Number(port ?? 8080));
    }

    _db = db;
  }
  return _db;
}

/**
 * Lazy Firestore handle.
 *
 * Importing this module must not create the client (and its ~170 KB SDK) at
 * module load: only reading a property initializes it, so pages that import a
 * shared helper without querying stay cheap, and builds without client env
 * variables do not fail while collecting page data.
 */
export const db: Firestore = new Proxy({} as Firestore, {
  get(_target, property) {
    const instance = getFirebaseDb();

    // Load-bearing, exactly like `auth._delegate` in `./firebase`. The modular
    // API normalizes its first argument with `getModularInstance()`, which
    // returns `service._delegate ?? service` and then checks
    // `instanceof Firestore`. Without this branch `doc(db, ...)`,
    // `collection(db, ...)` and the rest reject the proxy with "Expected first
    // argument to doc() to be a CollectionReference, a DocumentReference or
    // FirebaseFirestore", which put every signed-in page in its error boundary.
    if (property === "_delegate") return instance;

    const value = (instance as unknown as Record<PropertyKey, unknown>)[
      property
    ];
    return typeof value === "function" ? value.bind(instance) : value;
  },
  set(_target, property, value) {
    (getFirebaseDb() as unknown as Record<PropertyKey, unknown>)[property] =
      value;
    return true;
  },
});
