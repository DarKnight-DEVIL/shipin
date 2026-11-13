import { getFirestore, type Firestore } from "firebase/firestore";

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
    _db = getFirestore(ensureFirebaseApp().app);
  }
  return _db;
}

export const db: Firestore = getFirebaseDb();
