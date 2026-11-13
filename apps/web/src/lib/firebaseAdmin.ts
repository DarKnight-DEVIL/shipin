import {
  cert,
  getApps,
  initializeApp,
  type App,
} from 'firebase-admin/app';

import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { serverEnv } from '@/config/env';
import { ShipINError } from '@/utils/errors';

function getAdminApp(): App {
  if (getApps().length > 0) {
    return getApps()[0]!;
  }

  const privateKey = serverEnv.FIREBASE_ADMIN_PRIVATE_KEY.replace(
    /\\n/g,
    '\n'
  );

  const projectId = serverEnv.FIREBASE_ADMIN_PROJECT_ID;
  const clientEmail = serverEnv.FIREBASE_ADMIN_CLIENT_EMAIL;

  if (!projectId || !clientEmail || !privateKey) {
    // Must be a ShipINError: `toShipINError` only maps Error instances and
    // would turn this into a generic INTERNAL_ERROR, hiding the real cause.
    throw new ShipINError(
      'Missing Firebase Admin environment variables. Set FIREBASE_ADMIN_PROJECT_ID, FIREBASE_ADMIN_CLIENT_EMAIL, and FIREBASE_ADMIN_PRIVATE_KEY.',
      'CONFIG_ERROR',
      500
    );
  }

  return initializeApp({
    credential: cert({
      projectId,
      clientEmail,
      privateKey,
    }),
  });
}

function createAdminDb() {
  return getFirestore(getAdminApp());
}

function createAdminAuth() {
  return getAuth(getAdminApp());
}

// Lazy getters — only initialize when an API route actually runs
export const adminDb = new Proxy({} as ReturnType<typeof getFirestore>, {
  get(_target, prop, receiver) {
    const db = createAdminDb();
    const value = Reflect.get(db, prop, receiver);
    return typeof value === 'function' ? value.bind(db) : value;
  },
});

export const adminAuth = new Proxy({} as ReturnType<typeof getAuth>, {
  get(_target, prop, receiver) {
    const auth = createAdminAuth();
    const value = Reflect.get(auth, prop, receiver);
    return typeof value === 'function' ? value.bind(auth) : value;
  },
});

// Test-only escape hatch so compliance tests can swap the underlying collection
// without importing serverEnv (which would require a full server env during tests).
export function setTestDb(_db: unknown): void {
  // This is a no-op in production; the compliance test stubs only replace the
  // collection factory on the hoisted vitest context.
}
