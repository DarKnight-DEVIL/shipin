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
  // Signs the admin MFA cookie. Required in production, so every case that is
  // not about it has to provide it — CI has no .env.local to fall back on.
  "MFA_SESSION_SECRET",
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
  setAlertWebhookConfigured();
  vi.stubEnv("PAYPAL_WEBHOOK_ID", "WH-1");
  vi.stubEnv("MFA_SESSION_SECRET", "test-mfa-session-secret-0123456789abcdef");
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

/** Any one of the four satisfies the alert-channel requirement. */
const ALERT_WEBHOOK = "APP_CHECK_ALERT_WEBHOOK_URL";
const ALERT_OPT_OUT = "ALERT_WEBHOOK_OPTIONAL";

function setAlertWebhookConfigured() {
  vi.stubEnv(ALERT_WEBHOOK, "https://discord.test/webhook");
}

function setStoreConfigured() {
  vi.stubEnv(STORE_URL, "https://example.upstash.io");
  vi.stubEnv(STORE_TOKEN, "token");
}

beforeEach(() => {
  for (const key of [...SERVER_ENV_KEYS, "PAYPAL_WEBHOOK_ID", OPT_OUT, ALERT_OPT_OUT])
    vi.stubEnv(key, "");
  // The store pair has to be cleared explicitly: a developer shell or CI job
  // that exports real Upstash credentials would otherwise make every
  // "store is unset" case below pass vacuously, with the validator seeing a
  // configured store and returning quietly.
  vi.stubEnv(STORE_URL, "");
  vi.stubEnv(STORE_TOKEN, "");
  for (const key of CLIENT_KEYS) vi.stubEnv(key, "test-value");
  // `NEXT_PUBLIC_APP_URL` is a trusted origin, not just a link prefix, so the
  // validator checks its shape before the cases below run. A placeholder like
  // "test-value" fails that check and would mask every assertion here.
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://example.com");
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

  it("throws in production when no alert webhook is configured", async () => {
    // Silence is the failure mode: with nobody to page, an App Check quota outage
    // rejects every API call while /api/health merely says `degraded`.
    setEverythingButStore();
    setStoreConfigured();
    vi.stubEnv(ALERT_WEBHOOK, "");
    const { validateProductionRequiredEnv } = await loadEnvModule();

    expect(() => validateProductionRequiredEnv()).toThrow(/No alert webhook/);
  });

  it("names every webhook that would satisfy it", async () => {
    setEverythingButStore();
    setStoreConfigured();
    vi.stubEnv(ALERT_WEBHOOK, "");
    const { validateProductionRequiredEnv } = await loadEnvModule();

    let message = "";
    try {
      validateProductionRequiredEnv();
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }

    for (const key of [
      "APP_CHECK_ALERT_WEBHOOK_URL",
      "ERROR_ALERT_WEBHOOK_URL",
      "ALERT_WEBHOOK_URL",
      "BREACH_ALERT_WEBHOOK_URL",
    ]) {
      expect(message).toContain(key);
    }
    expect(message).toContain(ALERT_OPT_OUT);
  });

  it("accepts any one of the four webhooks", async () => {
    for (const key of [
      "APP_CHECK_ALERT_WEBHOOK_URL",
      "ERROR_ALERT_WEBHOOK_URL",
      "ALERT_WEBHOOK_URL",
      "BREACH_ALERT_WEBHOOK_URL",
    ]) {
      setEverythingButStore();
      setStoreConfigured();
      for (const other of [
        "APP_CHECK_ALERT_WEBHOOK_URL",
        "ERROR_ALERT_WEBHOOK_URL",
        "ALERT_WEBHOOK_URL",
        "BREACH_ALERT_WEBHOOK_URL",
      ]) {
        vi.stubEnv(other, "");
      }
      vi.stubEnv(key, "https://hooks.test/one");

      const { validateProductionRequiredEnv } = await loadEnvModule();
      expect(validateProductionRequiredEnv).not.toThrow();
    }
  });

  it("allows a missing webhook only with the E2E opt-out exactly 1", async () => {
    setEverythingButStore();
    setStoreConfigured();
    vi.stubEnv(ALERT_WEBHOOK, "");
    vi.stubEnv(ALERT_OPT_OUT, "1");

    const { validateProductionRequiredEnv } = await loadEnvModule();
    expect(() => validateProductionRequiredEnv()).not.toThrow();
  });

  it("keeps the requirement for other opt-out values, so a typo cannot disable it", async () => {
    setEverythingButStore();
    setStoreConfigured();
    vi.stubEnv(ALERT_WEBHOOK, "");
    vi.stubEnv(ALERT_OPT_OUT, "true");

    const { validateProductionRequiredEnv } = await loadEnvModule();
    expect(() => validateProductionRequiredEnv()).toThrow(/No alert webhook/);
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

describe("emulator guard", () => {
  it("refuses to boot production with an emulator variable set", async () => {
    setEverythingButStore();
    vi.stubEnv(STORE_URL, "https://redis.example");
    vi.stubEnv(STORE_TOKEN, "token");
    vi.stubEnv("FIRESTORE_EMULATOR_HOST", "127.0.0.1:8080");
    const { validateProductionRequiredEnv } = await loadEnvModule();

    expect(() => validateProductionRequiredEnv()).toThrow(
      /FIRESTORE_EMULATOR_HOST/
    );
  });

  it("names every emulator variable that is set", async () => {
    setEverythingButStore();
    vi.stubEnv(STORE_URL, "https://redis.example");
    vi.stubEnv(STORE_TOKEN, "token");
    vi.stubEnv("FIRESTORE_EMULATOR_HOST", "127.0.0.1:8080");
    vi.stubEnv("NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST", "127.0.0.1:9099");
    const { validateProductionRequiredEnv } = await loadEnvModule();

    expect(() => validateProductionRequiredEnv()).toThrow(
      /FIRESTORE_EMULATOR_HOST.*NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST/s
    );
  });

  it("lets the E2E opt-out allow emulator variables", async () => {
    setEverythingButStore();
    vi.stubEnv(STORE_URL, "https://redis.example");
    vi.stubEnv(STORE_TOKEN, "token");
    vi.stubEnv("FIRESTORE_EMULATOR_HOST", "127.0.0.1:8080");
    vi.stubEnv("EMULATOR_GUARD_OPTIONAL", "1");
    const { validateProductionRequiredEnv } = await loadEnvModule();

    expect(() => validateProductionRequiredEnv()).not.toThrow();
  });

  it("does not fire outside production", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("FIRESTORE_EMULATOR_HOST", "127.0.0.1:8080");
    const { validateProductionRequiredEnv } = await loadEnvModule();

    expect(() => validateProductionRequiredEnv()).not.toThrow();
  });

  it('treats the opt-out like the others: only the exact string "1"', async () => {
    vi.stubEnv("EMULATOR_GUARD_OPTIONAL", "true");
    const enabled = await loadEnvModule();
    expect(enabled.isEmulatorGuardOptional()).toBe(false);

    vi.stubEnv("EMULATOR_GUARD_OPTIONAL", "1");
    const on = await loadEnvModule();
    expect(on.isEmulatorGuardOptional()).toBe(true);
  });
});
