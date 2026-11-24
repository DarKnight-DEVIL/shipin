/**
 * `scripts/check-production-env.ts` — the pre-deploy preflight.
 *
 * The server refuses to boot without the shared rate-limit store, and every CI
 * build job sets dummy values for it, so the refusal itself was the one part of
 * that requirement nothing exercised end to end. These cases run the script the
 * way CI does, in both directions: a regression that turns the check back into
 * a no-op (or that skips it outside the production branch) fails here.
 */

import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const SCRIPT = "scripts/check-production-env.ts";

/** Everything a production boot needs, except what a case removes. */
const COMPLETE_ENV: Record<string, string> = {
  NODE_ENV: "production",
  PAYPAL_WEBHOOK_ID: "WH-1",
  MFA_SESSION_SECRET: "test-mfa-session-secret-0123456789abcdef",
  FIREBASE_ADMIN_PROJECT_ID: "test-project",
  FIREBASE_ADMIN_CLIENT_EMAIL: "test@test.iam.gserviceaccount.com",
  FIREBASE_ADMIN_PRIVATE_KEY: "private-key-placeholder",
  PAYPAL_CLIENT_ID: "test-client-id",
  PAYPAL_CLIENT_SECRET: "test-client-secret",
  SMTP_EMAIL: "test@example.com",
  SMTP_PASSWORD: "test-pass",
  RESEND_API_KEY: "re-test-key",
  R2_ACCOUNT_ID: "test-account",
  R2_ACCESS_KEY_ID: "test-key-id",
  R2_SECRET_ACCESS_KEY: "test-secret",
  R2_BUCKET_NAME: "test-bucket",
  APP_URL: "https://example.com",
  // The script imports the env module, which validates these at import time —
  // the same order a boot follows.
  NEXT_PUBLIC_PAYPAL_CLIENT_ID: "test",
  NEXT_PUBLIC_APP_URL: "https://example.com",
  NEXT_PUBLIC_FIREBASE_API_KEY: "test",
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: "test.firebaseapp.com",
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: "test",
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: "123456",
  NEXT_PUBLIC_FIREBASE_APP_ID: "1:123456:web:abcdef",
};

/** Variables a case is allowed to be missing or to vary. */
const STORE_KEYS = [
  "UPSTASH_REDIS_REST_URL",
  "UPSTASH_REDIS_REST_TOKEN",
  "RATE_LIMIT_STORE_OPTIONAL",
] as const;

function run(overrides: Record<string, string | undefined>) {
  const env: NodeJS.ProcessEnv = { ...process.env };

  // The developer's shell (or a loaded .env) may carry real Upstash values;
  // a preflight test that inherited them would pass while asserting nothing.
  for (const key of STORE_KEYS) delete env[key];
  Object.assign(env, COMPLETE_ENV);

  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) delete env[key];
    else env[key] = value;
  }

  return spawnSync(
    process.execPath,
    ["--experimental-strip-types", SCRIPT],
    { cwd: process.cwd(), env, encoding: "utf8" }
  );
}

describe("check:production-env", () => {
  it("fails and names both store variables when they are unset", () => {
    const result = run({});

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("UPSTASH_REDIS_REST_URL");
    expect(result.stderr).toContain("UPSTASH_REDIS_REST_TOKEN");
    expect(result.stderr).toContain("RATE_LIMIT_STORE_OPTIONAL=1");
    // The hint has to describe the consequence, not just the key.
    expect(result.stderr).toMatch(/fail open|per-instance/);
  });

  it("fails and names PAYPAL_WEBHOOK_ID when it is unset", () => {
    // Required in production for the same reason as the store: a capture that
    // cannot be verified must not be accepted, and the boot check is what turns
    // that into a failed release rather than a webhook that 500s on every
    // delivery PayPal sends.
    const result = run({ PAYPAL_WEBHOOK_ID: undefined });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("PAYPAL_WEBHOOK_ID");
  });

  it("passes when the store is configured", () => {
    const result = run({
      UPSTASH_REDIS_REST_URL: "https://example.upstash.io",
      UPSTASH_REDIS_REST_TOKEN: "token",
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Production environment OK");
  });

  it("refuses to run a check it would skip outside production", () => {
    const result = run({ NODE_ENV: "test" });

    // Without this, a CI job that forgot NODE_ENV would report success while
    // validateProductionRequiredEnv returned immediately.
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("NODE_ENV=production");
  });
});
