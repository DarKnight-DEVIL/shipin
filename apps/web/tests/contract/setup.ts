/**
 * Environment for the contract suites.
 *
 * These suites import the real `@/config/env`, which validates the client
 * variables the moment the module is evaluated — a suite that only cares about
 * a server API still has to look like a running app. Placeholders are supplied
 * for everything except the credentials under test, which come from the caller.
 *
 * `vitest.setup.ts` is deliberately NOT used here: it mocks `@/config/env` with
 * a frozen object, so the PayPal base URL and credentials could never reach the
 * code, and the suite would be testing the mock again.
 */

const placeholders: Record<string, string> = {
  NODE_ENV: "test",
  APP_URL: "http://localhost:3000",
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
