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
 *   E2E_SEED_TOTP_SECRET      base32 secret to enrol on a second, refund-only
 *                             admin (the seeded admin itself stays without MFA)
 *   E2E_SEED_MFA_EMAIL        (default e2e-refund-admin@shipin.test)
 *   E2E_SEED_MFA_PASSWORD     (default E2E_SEED_PASSWORD)
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

// Admin routes are gated on an enrolled second factor, so the refund smoke test
// needs an admin that can satisfy `requireAdmin`. Enrolling a TOTP here — the
// same shape `/api/auth/mfa/totp/setup` + `/verify` leave behind — is what makes
// that test runnable against the emulators instead of only on a staging
// deployment with a service account.
//
// It is a SEPARATE account on purpose. `mfa-passkey.spec.ts` registers its own
// factor and `admin-refund-local.spec.ts` asserts the gate's MFA_SETUP_REQUIRED
// path; both need an admin with nothing enrolled, so enrolling TOTP on the
// seeded admin broke them.
const totpSecret = process.env.E2E_SEED_TOTP_SECRET ?? "";
const refundAdminEmail =
  process.env.E2E_SEED_MFA_EMAIL ?? "e2e-refund-admin@shipin.test";
const refundAdminPassword = process.env.E2E_SEED_MFA_PASSWORD ?? password;

/**
 * Create (or repair) one Auth user and its `users/{uid}` profile.
 * `totpSecret` is only written when given, so an account seeded without one
 * really has no second factor — the gate distinguishes the two states.
 */
async function seedAccount({
  email,
  password,
  role,
  displayName,
  totpSecret = "",
  emailVerified = true,
  profileEmailVerified = emailVerified,
}) {
  const profile = {
    email,
    displayName,
    role,
    /*
     * Deliberately settable apart from the Auth flag. The admin list reads
     * verification from Auth because the profile copy is only written by the
     * override; a fixture where the two disagree is the only way to notice a
     * regression back to reading the profile.
     */
    emailVerified: profileEmailVerified,
    ...(totpSecret
      ? {
          mfa: {
            totp: { secret: totpSecret, enabled: true, backupCodes: [] },
            required: true,
          },
        }
      : {}),
    updatedAt: FieldValue.serverTimestamp(),
  };

  let uid;

  try {
    const existing = await auth.getUserByEmail(email);
    uid = existing.uid;
    await auth.updateUser(uid, {
      password,
      emailVerified,
      displayName,
    });
  } catch (error) {
    if (error?.code !== "auth/user-not-found") {
      fail(`could not read the auth emulator: ${error?.message ?? error}`);
    }
    const created = await auth.createUser({
      email,
      password,
      emailVerified,
      displayName,
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

  return uid;
}

const uid = await seedAccount({
  email,
  password,
  role,
  displayName: "E2E Admin",
});

/*
 * An account Auth considers unverified while its profile claims the opposite.
 * `admin-verify-email.spec.ts` needs something for the "Verify email" action to
 * act on, and the disagreement is the point: the list must trust Auth.
 */
const unverifiedEmail =
  process.env.E2E_SEED_UNVERIFIED_EMAIL ?? "e2e-unverified@shipin.test";
const unverifiedUid = await seedAccount({
  email: unverifiedEmail,
  password,
  role: "customer",
  displayName: "E2E Unverified",
  emailVerified: false,
  profileEmailVerified: true,
});

console.log(`E2E_ADMIN_EMAIL=${email}`);
console.log(`E2E_ADMIN_PASSWORD=${password}`);
console.log(`E2E_ADMIN_UID=${uid}`);
console.log(`E2E_UNVERIFIED_EMAIL=${unverifiedEmail}`);
console.log(`E2E_UNVERIFIED_UID=${unverifiedUid}`);

if (totpSecret) {
  const refundAdminUid = await seedAccount({
    email: refundAdminEmail,
    password: refundAdminPassword,
    role: "admin",
    displayName: "E2E Refund Admin",
    totpSecret,
  });

  console.log(`E2E_REFUND_ADMIN_EMAIL=${refundAdminEmail}`);
  console.log(`E2E_REFUND_ADMIN_PASSWORD=${refundAdminPassword}`);
  console.log(`E2E_REFUND_ADMIN_UID=${refundAdminUid}`);
  console.log(`E2E_ADMIN_TOTP_SECRET=${totpSecret}`);
}
