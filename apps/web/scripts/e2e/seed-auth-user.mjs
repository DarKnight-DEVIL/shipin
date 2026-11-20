#!/usr/bin/env node
/**
 * Seeds the local Firebase Auth + Firestore emulators with a signed-in test
 * admin, so `signed-in-smoke.spec.ts` can run without a staging account.
 *
 * Creates (or repairs) an Auth user with a known password and a matching
 * `users/{uid}` document with role "admin" — the same shape the login page and
 * AdminGuard read. Everything goes through the emulators: this refuses to run
 * unless FIREBASE_AUTH_EMULATOR_HOST is set, so it can never touch a real
 * project.
 *
 * Usage (the runner does this for you); from apps/web:
 *   FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 \
 *   node scripts/e2e/seed-auth-user.mjs
 *
 * Prints the credentials as `KEY=value` lines (no secrets — these are emulator
 * fixtures) so a runner can export them.
 *
 * Optional environment:
 *   E2E_SEED_EMAIL     (default e2e-admin@shipin.test)
 *   E2E_SEED_PASSWORD  (default shipin-e2e-password)
 *   E2E_SEED_ROLE      "admin" (default) or "customer"
 *   FIREBASE_ADMIN_PROJECT_ID  (default shipin-e2e)
 */
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

function fail(message) {
  console.error(`seed-auth-user: ${message}`);
  process.exit(1);
}

const authEmulatorHost = process.env.FIREBASE_AUTH_EMULATOR_HOST ?? "";
const firestoreEmulatorHost = process.env.FIRESTORE_EMULATOR_HOST ?? "";

if (!authEmulatorHost) {
  fail(
    "FIREBASE_AUTH_EMULATOR_HOST is not set. This script only seeds the local " +
      "emulators; refusing to create users in a real Firebase project."
  );
}

const email = process.env.E2E_SEED_EMAIL ?? "e2e-admin@shipin.test";
const password = process.env.E2E_SEED_PASSWORD ?? "shipin-e2e-password";
const role = process.env.E2E_SEED_ROLE ?? "admin";
const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID ?? "shipin-e2e";

const { initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

const app = initializeApp({ projectId });
const auth = getAuth(app);
const db = getFirestore(app);

const profile = {
  email,
  displayName: "E2E Admin",
  role,
  emailVerified: true,
  updatedAt: FieldValue.serverTimestamp(),
};

let uid;

try {
  const existing = await auth.getUserByEmail(email);
  uid = existing.uid;
  await auth.updateUser(uid, {
    password,
    emailVerified: true,
    displayName: profile.displayName,
  });
} catch (error) {
  if (error?.code !== "auth/user-not-found") {
    fail(`could not read the auth emulator: ${error?.message ?? error}`);
  }
  const created = await auth.createUser({
    email,
    password,
    emailVerified: true,
    displayName: profile.displayName,
  });
  uid = created.uid;
}

if (firestoreEmulatorHost) {
  await db
    .collection("users")
    .doc(uid)
    .set(
      { ...profile, createdAt: FieldValue.serverTimestamp() },
      { merge: true }
    );
} else {
  console.error(
    "seed-auth-user: FIRESTORE_EMULATOR_HOST is not set, so no profile document " +
      'was written. The admin area needs users/{uid}.role = "admin".'
  );
}

console.log(`E2E_ADMIN_EMAIL=${email}`);
console.log(`E2E_ADMIN_PASSWORD=${password}`);
console.log(`E2E_ADMIN_UID=${uid}`);
