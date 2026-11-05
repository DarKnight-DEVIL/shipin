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

function readNumberEnv(key: string, required = false): number | undefined {
  const value = process.env[key];
  if (!value) {
    if (required) throw new Error(`Missing required environment variable: ${key}`);
    return undefined;
  }
  const num = Number(value);
  if (Number.isNaN(num)) {
    throw new Error(`Environment variable ${key} must be a number, got: ${value}`);
  }
  return num;
}

/**
 * Build the validated server-side environment object.
 * Throws if any required var is missing.
 */
function buildServerEnv(): ServerEnv {
  return {
    NODE_ENV: (process.env.NODE_ENV as NodeEnv) ?? 'development',
    FIREBASE_ADMIN_PROJECT_ID: readEnv('FIREBASE_ADMIN_PROJECT_ID', true)!,
    FIREBASE_ADMIN_CLIENT_EMAIL: readEnv('FIREBASE_ADMIN_CLIENT_EMAIL', true)!,
    FIREBASE_ADMIN_PRIVATE_KEY: readEnv('FIREBASE_ADMIN_PRIVATE_KEY', true)!,
    PAYPAL_CLIENT_ID: readEnv('PAYPAL_CLIENT_ID', true)!,
    PAYPAL_CLIENT_SECRET: readEnv('PAYPAL_CLIENT_SECRET', true)!,
    PAYPAL_ENV: (process.env.PAYPAL_ENV as 'live' | 'sandbox') ?? 'sandbox',
    PAYPAL_API_URL: readEnv('PAYPAL_API_URL'),
    PAYPAL_WEBHOOK_ID: readEnv('PAYPAL_WEBHOOK_ID'),
    SMTP_EMAIL: readEnv('SMTP_EMAIL', true)!,
    SMTP_PASSWORD: readEnv('SMTP_PASSWORD', true)!,
    RESEND_API_KEY: readEnv('RESEND_API_KEY', true)!,
    UPSTASH_REDIS_REST_URL: readEnv('UPSTASH_REDIS_REST_URL'),
    UPSTASH_REDIS_REST_TOKEN: readEnv('UPSTASH_REDIS_REST_TOKEN'),
    R2_ACCOUNT_ID: readEnv('R2_ACCOUNT_ID', true)!,
    R2_ACCESS_KEY_ID: readEnv('R2_ACCESS_KEY_ID', true)!,
    R2_SECRET_ACCESS_KEY: readEnv('R2_SECRET_ACCESS_KEY', true)!,
    R2_BUCKET_NAME: readEnv('R2_BUCKET_NAME', true)!,
    APP_URL: readEnv('APP_URL', true)!,
    WHATSAPP_ACCESS_TOKEN: readEnv('WHATSAPP_ACCESS_TOKEN'),
    WHATSAPP_PHONE_NUMBER_ID: readEnv('WHATSAPP_PHONE_NUMBER_ID'),
    WHATSAPP_API_VERSION: readEnv('WHATSAPP_API_VERSION') ?? 'v25.0',
  };
}

/**
 * Lazily-built, cached instance of the validated server environment.
 * Null until first access so that merely importing this module does NOT
 * force evaluation of server-only secrets.
 */
let _serverEnv: ServerEnv | null = null;
function getServerEnv(): ServerEnv {
  if (_serverEnv === null) _serverEnv = buildServerEnv();
  return _serverEnv;
}

/**
 * Server-side environment variables.
 *
 * Lazily validated via a Proxy so that merely importing this module does NOT
 * force evaluation of server-only secrets. This is required because some
 * client-safe modules (e.g. src/lib/firebase.ts) import from this module for
 * the client-side `clientEnv`; a top-level `const serverEnv` would eagerly
 * throw when the client bundle loads and the server-only vars are absent.
 *
 * Accessing any server-only property still fails fast with the same error as
 * before, so the original startup validation behaviour is preserved for
 * server code.
 */
export const serverEnv: ServerEnv = new Proxy({} as ServerEnv, {
  get(_target, prop) {
    return getServerEnv()[prop as keyof ServerEnv];
  },
  has(_target, prop) {
    return prop in getServerEnv();
  },
  ownKeys(_target) {
    return Reflect.ownKeys(getServerEnv());
  },
  getOwnPropertyDescriptor(_target, prop) {
    return Reflect.getOwnPropertyDescriptor(getServerEnv(), prop as keyof ServerEnv);
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