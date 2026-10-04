import {
  cert,
  getApps,
  initializeApp,
  type App,
} from "firebase-admin/app";

import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";

function getAdminApp(): App {
  if (getApps().length > 0) {
    return getApps()[0]!;
  }

  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(
    /\\n/g,
    "\n"
  );

  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      "Missing Firebase Admin environment variables. Set FIREBASE_ADMIN_PROJECT_ID, FIREBASE_ADMIN_CLIENT_EMAIL, and FIREBASE_ADMIN_PRIVATE_KEY."
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
    return typeof value === "function" ? value.bind(db) : value;
  },
});

export const adminAuth = new Proxy({} as ReturnType<typeof getAuth>, {
  get(_target, prop, receiver) {
    const auth = createAdminAuth();
    const value = Reflect.get(auth, prop, receiver);
    return typeof value === "function" ? value.bind(auth) : value;
  },
});