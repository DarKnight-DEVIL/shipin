/**
 * Environment for the Firebase Admin contract suite.
 *
 * The suite imports the real `@/config/env` and `@/lib/firebaseAdmin`. Two
 * things have to be true before either will load:
 *
 *   - `clientEnv` validates its `NEXT_PUBLIC_*` members at module evaluation,
 *     even though nothing here is client-side, so placeholders stand in.
 *   - `getAdminApp()` reads the service-account trio *before* it checks for an
 *     emulator host, so the variables must exist even in emulator mode. In that
 *     mode their values are never used to authenticate.
 *
 * `vitest.setup.ts` is not loaded: it mocks `@/config/env` with a frozen object,
 * which would make the emulator check in `firebaseAdmin.ts` unreachable.
 */

const placeholders: Record<string, string> = {
  NODE_ENV: "test",
  APP_URL: "http://localhost:3000",
  FIREBASE_ADMIN_PROJECT_ID: "demo-shipin",
  FIREBASE_ADMIN_CLIENT_EMAIL: "contract@demo-shipin.iam.gserviceaccount.com",
  FIREBASE_ADMIN_PRIVATE_KEY: "contract-placeholder",
  NEXT_PUBLIC_PAYPAL_CLIENT_ID: "contract-test",
  NEXT_PUBLIC_APP_URL: "http://localhost:3000",
  NEXT_PUBLIC_FIREBASE_API_KEY: "contract-test",
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: "contract-test.firebaseapp.com",
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: "contract-test",
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: "contract-test",
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: "000000000000",
  NEXT_PUBLIC_FIREBASE_APP_ID: "1:000000000000:web:contract",
};

for (const [key, value] of Object.entries(placeholders)) {
  process.env[key] ??= value;
}

// A module, not a script: two setup files declaring `placeholders` at top
// level would otherwise collide in the shared global scope tsc checks.
export {};
