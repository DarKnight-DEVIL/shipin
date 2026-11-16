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

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The global setup mocks this module for every other test; these cases are
// about the real one, so opt out of that mock locally.
vi.unmock('@/config/env');

const STORE_KEYS = ['UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN'] as const;
const OPT_OUT = 'RATE_LIMIT_STORE_OPTIONAL';

const ENV_KEYS = [
  'NODE_ENV',
  'NEXT_PHASE',
  'PAYPAL_WEBHOOK_ID',
  ...STORE_KEYS,
  OPT_OUT,
] as const;

/**
 * The real module builds `clientEnv` on import and throws when these are
 * missing outside `next build`. They are unrelated to what is under test here,
 * so they get dummy values and stay out of the way.
 */
const CLIENT_KEYS = [
  'NEXT_PUBLIC_PAYPAL_CLIENT_ID',
  'NEXT_PUBLIC_APP_URL',
  'NEXT_PUBLIC_FIREBASE_API_KEY',
  'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN',
  'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
  'NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET',
  'NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
  'NEXT_PUBLIC_FIREBASE_APP_ID',
] as const;

async function loadEnvModule() {
  vi.resetModules();
  return import('./index');
}

function setStoreConfigured() {
  vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://example.upstash.io');
  vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'token');
}

beforeEach(() => {
  for (const key of [...ENV_KEYS, ...CLIENT_KEYS]) vi.stubEnv(key, '');
  for (const key of CLIENT_KEYS) vi.stubEnv(key, 'test-value');
  vi.stubEnv('PAYPAL_WEBHOOK_ID', 'WH-1');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('validateProductionRequiredEnv', () => {

  it('does nothing outside production', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    const { validateProductionRequiredEnv } = await loadEnvModule();

    expect(() => validateProductionRequiredEnv()).not.toThrow();
  });

  it('throws in production when the shared rate-limit store is unset', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const { validateProductionRequiredEnv } = await loadEnvModule();

    expect(() => validateProductionRequiredEnv()).toThrow(/UPSTASH_REDIS_REST_URL/);
  });

  it('names both store variables and the opt-out, so the failure is actionable', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const { validateProductionRequiredEnv } = await loadEnvModule();

    let message = '';
    try {
      validateProductionRequiredEnv();
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }

    expect(message).toContain('UPSTASH_REDIS_REST_URL');
    expect(message).toContain('UPSTASH_REDIS_REST_TOKEN');
    expect(message).toContain('RATE_LIMIT_STORE_OPTIONAL=1');
    // The hint must describe the consequence, not just the missing key.
    expect(message).toMatch(/fail open|per-instance limits/);
  });

  it('throws when only one of the two store variables is set', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://example.upstash.io');
    const { validateProductionRequiredEnv } = await loadEnvModule();

    expect(() => validateProductionRequiredEnv()).toThrow(/UPSTASH_REDIS_REST_TOKEN/);
  });

  it('passes in production when both store variables are set', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    setStoreConfigured();
    const { validateProductionRequiredEnv } = await loadEnvModule();

    expect(() => validateProductionRequiredEnv()).not.toThrow();
  });

  it('allows the missing store only when the E2E opt-out is exactly "1"', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv(OPT_OUT, '1');
    const { validateProductionRequiredEnv } = await loadEnvModule();

    expect(() => validateProductionRequiredEnv()).not.toThrow();
  });

  it('still requires the store for other opt-out values, so a typo cannot disable it', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv(OPT_OUT, 'true');
    const { validateProductionRequiredEnv } = await loadEnvModule();

    expect(() => validateProductionRequiredEnv()).toThrow(/UPSTASH_REDIS_REST_URL/);
  });

  it('does not let the opt-out hide a different missing production variable', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv(OPT_OUT, '1');
    vi.stubEnv('PAYPAL_WEBHOOK_ID', '');
    const { validateProductionRequiredEnv } = await loadEnvModule();

    expect(() => validateProductionRequiredEnv()).toThrow(/PAYPAL_WEBHOOK_ID/);
  });
});

describe('isRateLimitStoreOptional', () => {
  it('is false by default', async () => {
    vi.stubEnv(OPT_OUT, '');
    const { isRateLimitStoreOptional } = await loadEnvModule();

    expect(isRateLimitStoreOptional()).toBe(false);
  });

  it('is true only for the exact string "1"', async () => {
    vi.stubEnv(OPT_OUT, '1');
    const enabled = await loadEnvModule();
    expect(enabled.isRateLimitStoreOptional()).toBe(true);

    for (const value of ['true', 'yes', ' 1', '0']) {
      vi.stubEnv(OPT_OUT, value);
      const other = await loadEnvModule();
      expect(other.isRateLimitStoreOptional(), `value ${JSON.stringify(value)}`).toBe(false);
    }
  });
});
