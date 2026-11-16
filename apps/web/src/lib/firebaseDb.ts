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
    const emulatorHost = clientEnv.NEXT_PUBLIC_FIRESTORE_EMULATOR_HOST.trim();
    if (emulatorHost && typeof window !== "undefined") {
      const [host, port] = emulatorHost.split(":");
      connectFirestoreEmulator(db, host, Number(port ?? 8080));
    }

    _db = db;
  }
  return _db;
}

export const db: Firestore = getFirebaseDb();
