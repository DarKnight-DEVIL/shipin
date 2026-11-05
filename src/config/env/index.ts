/**
 * Centralized environment variable access.
 *
 * All env vars must be accessed through this module to ensure:
 *   1. Validation at startup (fail fast on missing required vars)
 *   2. Consistent naming across the codebase
 *   3. Safe defaults for optional values
 *   4. Clear separation of client vs server-only vars
 */

type NodeEnv = 'development' | 'production' | 'test';

/**
 * True only while `next build` is running (incl. the prerender/collect step).
 *
 * NEXT_PHASE is set to 'phase-production-build' for the duration of the build
 * and to 'phase-production-server' when the production server starts again, so
 * this never leaks leniency into actual runtime.
 */
function isBuildPhase(): boolean {
  return process.env.NEXT_PHASE === 'phase-production-build';
}

interface ServerEnv {
  NODE_ENV: NodeEnv;
  FIREBASE_ADMIN_PROJECT_ID: string;
  FIREBASE_ADMIN_CLIENT_EMAIL: string;
  FIREBASE_ADMIN_PRIVATE_KEY: string;
  PAYPAL_CLIENT_ID: string;
  PAYPAL_CLIENT_SECRET: string;
  PAYPAL_ENV: 'live' | 'sandbox';
  PAYPAL_API_URL?: string;
  PAYPAL_WEBHOOK_ID?: string;
  SMTP_EMAIL: string;
  SMTP_PASSWORD: string;
  RESEND_API_KEY: string;
  UPSTASH_REDIS_REST_URL?: string;
  UPSTASH_REDIS_REST_TOKEN?: string;
  R2_ACCOUNT_ID: string;
  R2_ACCESS_KEY_ID: string;
  R2_SECRET_ACCESS_KEY: string;
  R2_BUCKET_NAME: string;
  APP_URL: string;
  WHATSAPP_ACCESS_TOKEN?: string;
  WHATSAPP_PHONE_NUMBER_ID?: string;
  WHATSAPP_API_VERSION?: string;
}

interface ClientEnv {
  NODE_ENV: NodeEnv;
  NEXT_PUBLIC_PAYPAL_CLIENT_ID: string;
  NEXT_PUBLIC_APP_URL: string;
  NEXT_PUBLIC_FIREBASE_API_KEY: string;
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: string;
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: string;
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: string;
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: string;
  NEXT_PUBLIC_FIREBASE_APP_ID: string;
}

export function readEnv(key: string, required: boolean = false): string | undefined {
  const value = process.env[key];
  if (required && !value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

/**
 * Server-side environment variables.
 *
 * Per-property validation: each access validates only the requested variable,
 * giving precise error messages and allowing build-time collection to succeed
 * even when some server-only vars are missing (they're only needed at runtime).
 *
 * Accessing a required server-only property still fails fast with the same error
 * as before, so runtime startup validation behaviour is preserved.
 */

/** Server-only vars that MUST be present at runtime. */
const REQUIRED_SERVER_ENV: ReadonlySet<string> = new Set([
  'FIREBASE_ADMIN_PROJECT_ID',
  'FIREBASE_ADMIN_CLIENT_EMAIL',
  'FIREBASE_ADMIN_PRIVATE_KEY',
  'PAYPAL_CLIENT_ID',
  'PAYPAL_CLIENT_SECRET',
  'SMTP_EMAIL',
  'SMTP_PASSWORD',
  'RESEND_API_KEY',
  'R2_ACCOUNT_ID',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'R2_BUCKET_NAME',
  'APP_URL',
]);

/** Server-only vars that fall back to a default when unset. */
const DEFAULT_SERVER_ENV: Record<string, string> = {
  NODE_ENV: 'development',
  PAYPAL_ENV: 'sandbox',
  WHATSAPP_API_VERSION: 'v25.0',
};

/** Server-only vars that are optional (no default, no throw). */
const OPTIONAL_SERVER_ENV: ReadonlySet<string> = new Set([
  'PAYPAL_API_URL',
  'PAYPAL_WEBHOOK_ID',
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN',
  'WHATSAPP_ACCESS_TOKEN',
  'WHATSAPP_PHONE_NUMBER_ID',
]);

export const serverEnv: ServerEnv = new Proxy({} as ServerEnv, {
  get(_target, prop) {
    const key = prop as string;
    if (key in DEFAULT_SERVER_ENV) {
      return (process.env[key] ?? DEFAULT_SERVER_ENV[key]) as any;
    }
    const value = process.env[key];
    if (REQUIRED_SERVER_ENV.has(key)) {
      if (!value) {
        // Never let a missing secret kill the production build: Next evaluates
        // every route module during page-data collection, and env vars are not
        // guaranteed to exist on the build machine. Fail fast at runtime instead.
        if (isBuildPhase()) return undefined as any;
        throw new Error(`Missing required environment variable: ${key}`);
      }
      return value;
    }
    // Optional server-only vars — return undefined without throwing
    return value;
  },
  has(_target, prop) {
    const key = prop as string;
    if (key in DEFAULT_SERVER_ENV) return true;
    return !!process.env[key];
  },
  ownKeys(_target) {
    return [
      ...REQUIRED_SERVER_ENV,
      ...Object.keys(DEFAULT_SERVER_ENV),
      ...OPTIONAL_SERVER_ENV,
    ];
  },
  getOwnPropertyDescriptor(_target, prop) {
    const key = prop as string;
    let value: string | undefined;
    if (key in DEFAULT_SERVER_ENV) {
      value = process.env[key] ?? DEFAULT_SERVER_ENV[key];
    } else {
      value = process.env[key];
    }
    if (value === undefined) return undefined;
    return {
      value,
      writable: false,
      enumerable: true,
      configurable: true,
    };
  },
});

/**
 * Client-side environment variables (safe to expose to browser).
 *
 * Per-property validation: each access validates only the requested variable,
 * giving precise error messages and allowing build-time collection to succeed
 * even when some optional/unused vars are missing.
 */
export const clientEnv: ClientEnv = new Proxy({} as ClientEnv, {
  get(_target, prop) {
    const key = prop as string;
    if (key === 'NODE_ENV') {
      return (process.env.NODE_ENV as NodeEnv) ?? 'development';
    }
    const value = process.env[key];
    if (!value) {
      // Never let a missing NEXT_PUBLIC_* var kill the production build:
      // prerendering evaluates client components in a bare build environment.
      // Fail fast whenever the app actually runs instead.
      if (isBuildPhase()) return undefined as any;
      throw new Error(`Missing required environment variable: ${key}`);
    }
    return value;
  },
  has(_target, prop) {
    const key = prop as string;
    if (key === 'NODE_ENV') return true;
    return !!process.env[key];
  },
  ownKeys(_target) {
    return [
      'NODE_ENV',
      'NEXT_PUBLIC_PAYPAL_CLIENT_ID',
      'NEXT_PUBLIC_APP_URL',
      'NEXT_PUBLIC_FIREBASE_API_KEY',
      'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN',
      'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
      'NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET',
      'NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
      'NEXT_PUBLIC_FIREBASE_APP_ID',
    ];
  },
  getOwnPropertyDescriptor(_target, prop) {
    const key = prop as string;
    if (key === 'NODE_ENV') {
      return {
        value: (process.env.NODE_ENV as NodeEnv) ?? 'development',
        writable: false,
        enumerable: true,
        configurable: true,
      };
    }
    const value = process.env[key];
    if (!value) return undefined;
    return {
      value,
      writable: false,
      enumerable: true,
      configurable: true,
    };
  },
});

/** Whether the app is running in production. */
export const isProduction = (process.env.NODE_ENV as NodeEnv) === 'production';

/** Whether the app is running in development. */
export const isDevelopment = (process.env.NODE_ENV as NodeEnv) === 'development';

/** Whether the app is running in test. */
export const isTest = (process.env.NODE_ENV as NodeEnv) === 'test';