/**
 * Startup validation in `config/env`.
 *
 * The rate-limit store is required in production precisely because its absence
 * is invisible at runtime: the proxy fails open and every instance keeps its
 * own counters, so a deployment that forgot the two Upstash variables silently
 * runs without abuse protection. These tests pin that it refuses to boot, and
 * that the only way past it is the explicit E2E opt-out.
 *
 * `isProduction` is captured when the module is evaluated, so each case imports
 * a fresh copy after changing the environment.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The global setup mocks this module for every other test; these cases are
// about the real one, so opt out of that mock locally.
vi.unmock("@/config/env");

const STORE_URL = "UPSTASH_REDIS_REST_URL";
const STORE_TOKEN = "UPSTASH_REDIS_REST_TOKEN";
const OPT_OUT = "RATE_LIMIT_STORE_OPTIONAL";

/** Server-only vars that `validateProductionRequiredEnv` requires in production. */
const SERVER_ENV_KEYS = [
  "FIREBASE_ADMIN_PROJECT_ID",
  "FIREBASE_ADMIN_CLIENT_EMAIL",
  "FIREBASE_ADMIN_PRIVATE_KEY",
  "PAYPAL_CLIENT_ID",
  "PAYPAL_CLIENT_SECRET",
  "SMTP_EMAIL",
  "SMTP_PASSWORD",
  "RESEND_API_KEY",
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET_NAME",
  "APP_URL",
] as const;

/** Client vars, so importing the module does not trip other assertions. */
const CLIENT_KEYS = [
  "NEXT_PUBLIC_PAYPAL_CLIENT_ID",
  "NEXT_PUBLIC_APP_URL",
  "NEXT_PUBLIC_FIREBASE_API_KEY",
  "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
  "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
  "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET",
  "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
  "NEXT_PUBLIC_FIREBASE_APP_ID",
] as const;

async function loadEnvModule() {
  vi.resetModules();
  return import("./index");
}

/**
 * Sets every production-required variable EXCEPT the rate-limit store, so the
 * only thing a case can be missing is the pair it is testing. Callers that test
 * a different missing variable (or the store) start from here and adjust.
 */
function setEverythingButStore() {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("PAYPAL_WEBHOOK_ID", "WH-1");
  vi.stubEnv("FIREBASE_ADMIN_PROJECT_ID", "test-project");
  vi.stubEnv(
    "FIREBASE_ADMIN_CLIENT_EMAIL",
    "test@test.iam.gserviceaccount.com"
  );
  vi.stubEnv("FIREBASE_ADMIN_PRIVATE_KEY", "private-key-placeholder");
  vi.stubEnv("PAYPAL_CLIENT_ID", "test-client-id");
  vi.stubEnv("PAYPAL_CLIENT_SECRET", "test-client-secret");
  vi.stubEnv("SMTP_EMAIL", "test@example.com");
  vi.stubEnv("SMTP_PASSWORD", "test-pass");
  vi.stubEnv("RESEND_API_KEY", "re-test-key");
  vi.stubEnv("R2_ACCOUNT_ID", "test-account");
  vi.stubEnv("R2_ACCESS_KEY_ID", "test-key-id");
  vi.stubEnv("R2_SECRET_ACCESS_KEY", "test-secret");
  vi.stubEnv("R2_BUCKET_NAME", "test-bucket");
  vi.stubEnv("APP_URL", "https://example.com");
}

function setStoreConfigured() {
  vi.stubEnv(STORE_URL, "https://example.upstash.io");
  vi.stubEnv(STORE_TOKEN, "token");
}

beforeEach(() => {
  for (const key of [...SERVER_ENV_KEYS, "PAYPAL_WEBHOOK_ID", OPT_OUT])
    vi.stubEnv(key, "");
  for (const key of CLIENT_KEYS) vi.stubEnv(key, "test-value");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("validateProductionRequiredEnv", () => {
  it("does nothing outside production", async () => {
    vi.stubEnv("NODE_ENV", "test");
    const { validateProductionRequiredEnv } = await loadEnvModule();

    expect(() => validateProductionRequiredEnv()).not.toThrow();
  });

  it("throws in production when the shared rate-limit store is unset", async () => {
    // Everything else is set, so the store pair is the only thing missing.
    setEverythingButStore();
    const { validateProductionRequiredEnv } = await loadEnvModule();

    expect(() => validateProductionRequiredEnv()).toThrow(
      new RegExp(STORE_URL)
    );
  });

  it("names both store variables and the opt-out, so the failure is actionable", async () => {
    // Everything else is set, so the message is purely about the store.
    setEverythingButStore();
    const { validateProductionRequiredEnv } = await loadEnvModule();

    let message = "";
    try {
      validateProductionRequiredEnv();
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }

    expect(message).toContain(STORE_URL);
    expect(message).toContain(STORE_TOKEN);
    expect(message).toContain("RATE_LIMIT_STORE_OPTIONAL=1");
    // The hint must describe the consequence, not just the missing key.
    expect(message).toMatch(/fail open|per-instance limits/);
    // No unrelated variable should be reported missing.
    expect(message).not.toContain("FIREBASE_ADMIN_PROJECT_ID");
  });

  it("throws when only one of the two store variables is set", async () => {
    setEverythingButStore();
    vi.stubEnv(STORE_URL, "https://example.upstash.io");
    const { validateProductionRequiredEnv } = await loadEnvModule();

    expect(() => validateProductionRequiredEnv()).toThrow(
      new RegExp(STORE_TOKEN)
    );
  });

  it("passes in production when both store variables are set", async () => {
    setEverythingButStore();
    setStoreConfigured();
    const { validateProductionRequiredEnv } = await loadEnvModule();

    expect(() => validateProductionRequiredEnv()).not.toThrow();
  });

  it('allows the missing store only when the E2E opt-out is exactly "1"', async () => {
    setEverythingButStore();
    vi.stubEnv(OPT_OUT, "1");
    const { validateProductionRequiredEnv } = await loadEnvModule();

    expect(() => validateProductionRequiredEnv()).not.toThrow();
  });

  it("still requires the store for other opt-out values, so a typo cannot disable it", async () => {
    setEverythingButStore();
    vi.stubEnv(OPT_OUT, "true");
    const { validateProductionRequiredEnv } = await loadEnvModule();

    expect(() => validateProductionRequiredEnv()).toThrow(
      new RegExp(STORE_URL)
    );
  });

  it("does not let the opt-out hide a different missing production variable", async () => {
    setEverythingButStore();
    vi.stubEnv(OPT_OUT, "1");
    vi.stubEnv("PAYPAL_WEBHOOK_ID", "");
    const { validateProductionRequiredEnv } = await loadEnvModule();

    expect(() => validateProductionRequiredEnv()).toThrow(/PAYPAL_WEBHOOK_ID/);
  });
});

describe("APP_URL shape", () => {
  it("rejects a value that is not an absolute URL", async () => {
    setEverythingButStore();
    vi.stubEnv(STORE_URL, "https://redis.example");
    vi.stubEnv(STORE_TOKEN, "token");
    vi.stubEnv("APP_URL", "foo");
    const { validateProductionRequiredEnv } = await loadEnvModule();

    expect(() => validateProductionRequiredEnv()).toThrow(
      /APP_URL must be an absolute/
    );
  });

  it("accepts an https origin", async () => {
    setEverythingButStore();
    vi.stubEnv(STORE_URL, "https://redis.example");
    vi.stubEnv(STORE_TOKEN, "token");
    vi.stubEnv("APP_URL", "https://shipin.app");
    const { validateProductionRequiredEnv } = await loadEnvModule();

    expect(() => validateProductionRequiredEnv()).not.toThrow();
  });
});

describe("isRateLimitStoreOptional", () => {
  it("is false by default", async () => {
    const { isRateLimitStoreOptional } = await loadEnvModule();

    expect(isRateLimitStoreOptional()).toBe(false);
  });

  it('is true only for the exact string "1"', async () => {
    vi.stubEnv(OPT_OUT, "1");
    const enabled = await loadEnvModule();
    expect(enabled.isRateLimitStoreOptional()).toBe(true);

    for (const value of ["true", "yes", " 1", "0"]) {
      vi.stubEnv(OPT_OUT, value);
      const other = await loadEnvModule();
      expect(
        other.isRateLimitStoreOptional(),
        `value ${JSON.stringify(value)}`
      ).toBe(false);
    }
  });
});
