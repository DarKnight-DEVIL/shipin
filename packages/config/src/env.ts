export function getEnv(key: string, defaultValue?: string): string | undefined {
  const value = process.env[key];
  if (value === undefined && defaultValue !== undefined) {
    return defaultValue;
  }
  return value;
}

export function getRequiredEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

/** One reader per group, so a caller pays for — and is only refused by — the
 * variables it actually reads.
 * A single `readEnvConfig()` behind the proxy meant `ENV.SENTRY.DSN` built
 * the whole object: it threw about a missing R2 secret or PayPal key the
 * caller never asked for, and re-read every variable on each property access.
 * Now each group is read independently, and accessing a missing group returns
 * undefined instead of throwing.
 */

/** Readers for each env group — each one validates only its own variables. */
export const readers = {
  NODE_ENV: () => getEnv("NODE_ENV", "development"),
  APP_URL: () => getRequiredEnv("NEXT_PUBLIC_APP_URL"),
  FIREBASE: () => ({
    API_KEY: getRequiredEnv("NEXT_PUBLIC_FIREBASE_API_KEY"),
    AUTH_DOMAIN: getRequiredEnv("NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN"),
    PROJECT_ID: getRequiredEnv("NEXT_PUBLIC_FIREBASE_PROJECT_ID"),
    STORAGE_BUCKET: getRequiredEnv("NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET"),
    MESSAGING_SENDER_ID: getRequiredEnv("NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID"),
    APP_ID: getRequiredEnv("NEXT_PUBLIC_FIREBASE_APP_ID"),
  }),
  PAYPAL: () => ({
    CLIENT_ID: getRequiredEnv("NEXT_PUBLIC_PAYPAL_CLIENT_ID"),
    SECRET: getRequiredEnv("PAYPAL_CLIENT_SECRET"),
    ENV: getEnv("PAYPAL_ENV", "sandbox") as "sandbox" | "live",
  }),
  RESEND_API_KEY: () => getEnv("RESEND_API_KEY"),
  SMTP: () => ({
    EMAIL: getEnv("SMTP_EMAIL"),
    PASSWORD: getEnv("SMTP_PASSWORD"),
  }),
  R2: () => ({
    ACCOUNT_ID: getRequiredEnv("R2_ACCOUNT_ID"),
    ACCESS_KEY_ID: getRequiredEnv("R2_ACCESS_KEY_ID"),
    SECRET_ACCESS_KEY: getRequiredEnv("R2_SECRET_ACCESS_KEY"),
    BUCKET_NAME: getRequiredEnv("R2_BUCKET_NAME"),
  }),
  UPSTASH: () => ({
    REDIS_REST_URL: getEnv("UPSTASH_REDIS_REST_URL"),
    REDIS_REST_TOKEN: getEnv("UPSTASH_REDIS_REST_TOKEN"),
  }),
  SENTRY: () => ({
    DSN: getEnv("NEXT_PUBLIC_SENTRY_DSN"),
    SERVER_DSN: getEnv("SENTRY_DSN"),
    AUTH_TOKEN: getEnv("SENTRY_AUTH_TOKEN"),
  }),
} as const;

/** The validated environment, resolved per group on access. */
export type EnvConfig = {
  [K in keyof typeof readers]: ReturnType<(typeof readers)[K]>;
};

/** Safe proxy that never throws on property access.
 * Each group validates only its own variables — accessing ENV.SENTRY.DSN
 * will never throw about a missing R2 secret or PayPal key.
 * Accessing an unknown key returns undefined.
 */
export const ENV = new Proxy({} as EnvConfig, {
  get(_target, property) {
    if (typeof property !== "string" || !(property in readers)) {
      return undefined;
    }
    return readers[property as keyof typeof readers]();
  },
  has(_target, property) {
    return typeof property === "string" && property in readers;
  },
  getOwnPropertyDescriptor(_target, prop) {
    if (typeof prop !== "string" || !(prop in readers)) {
      return undefined;
    }
    return {
      value: readers[prop as keyof typeof readers](),
      writable: false,
      enumerable: true,
      configurable: true,
    };
  },
  ownKeys() {
    return Object.keys(readers);
  },
});