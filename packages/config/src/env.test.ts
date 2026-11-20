import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ENV, getEnv, getRequiredEnv } from "./env";

const MANAGED_KEYS = [
  "NEXT_PUBLIC_APP_URL",
  "NEXT_PUBLIC_FIREBASE_API_KEY",
  "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
  "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
  "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET",
  "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
  "NEXT_PUBLIC_FIREBASE_APP_ID",
  "NEXT_PUBLIC_PAYPAL_CLIENT_ID",
  "PAYPAL_CLIENT_SECRET",
  "PAYPAL_ENV",
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET_NAME",
  "NEXT_PUBLIC_SENTRY_DSN",
] as const;

let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = {};
  for (const key of MANAGED_KEYS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of MANAGED_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

describe("ENV", () => {
  it("resolves a group without validating unrelated required variables", () => {
    // Nothing is configured: Firebase, PayPal and R2 are all missing.
    expect(() => ENV.SENTRY).not.toThrow();
    expect(ENV.SENTRY.DSN).toBeUndefined();
  });

  it("still refuses a group that is missing its own required variables", () => {
    expect(() => ENV.R2).toThrow(/R2_ACCOUNT_ID/);
    expect(() => ENV.PAYPAL).toThrow(/NEXT_PUBLIC_PAYPAL_CLIENT_ID/);
  });

  it("reads the group's values from the environment", () => {
    process.env.R2_ACCOUNT_ID = "account";
    process.env.R2_ACCESS_KEY_ID = "key";
    process.env.R2_SECRET_ACCESS_KEY = "secret";
    process.env.R2_BUCKET_NAME = "bucket";

    expect(ENV.R2).toEqual({
      ACCOUNT_ID: "account",
      ACCESS_KEY_ID: "key",
      SECRET_ACCESS_KEY: "secret",
      BUCKET_NAME: "bucket",
    });
  });

  it("defaults PayPal to sandbox and honours an explicit environment", () => {
    process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID = "client";
    process.env.PAYPAL_CLIENT_SECRET = "secret";

    expect(ENV.PAYPAL.ENV).toBe("sandbox");

    process.env.PAYPAL_ENV = "live";
    expect(ENV.PAYPAL.ENV).toBe("live");
  });

  it("reports known groups to `in` and returns undefined for unknown keys", () => {
    expect("R2" in ENV).toBe(true);
    expect((ENV as unknown as Record<string, unknown>).NOPE).toBeUndefined();
  });
});

describe("getEnv / getRequiredEnv", () => {
  it("falls back to the default only when the variable is unset", () => {
    expect(getEnv("NEXT_PUBLIC_SENTRY_DSN", "fallback")).toBe("fallback");

    process.env.NEXT_PUBLIC_SENTRY_DSN = "configured";
    expect(getEnv("NEXT_PUBLIC_SENTRY_DSN", "fallback")).toBe("configured");
  });

  it("throws with the variable name when a required value is empty", () => {
    expect(() => getRequiredEnv("R2_BUCKET_NAME")).toThrow(
      "Missing required environment variable: R2_BUCKET_NAME"
    );
  });
});