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

export const ENV = {
  NODE_ENV: getEnv('NODE_ENV', 'development'),
  APP_URL: getRequiredEnv('NEXT_PUBLIC_APP_URL'),
  FIREBASE: {
    API_KEY: getRequiredEnv('NEXT_PUBLIC_FIREBASE_API_KEY'),
    AUTH_DOMAIN: getRequiredEnv('NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN'),
    PROJECT_ID: getRequiredEnv('NEXT_PUBLIC_FIREBASE_PROJECT_ID'),
    STORAGE_BUCKET: getRequiredEnv('NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET'),
    MESSAGING_SENDER_ID: getRequiredEnv('NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID'),
    APP_ID: getRequiredEnv('NEXT_PUBLIC_FIREBASE_APP_ID'),
  },
  PAYPAL: {
    CLIENT_ID: getRequiredEnv('NEXT_PUBLIC_PAYPAL_CLIENT_ID'),
    SECRET: getRequiredEnv('PAYPAL_CLIENT_SECRET'),
    ENV: getEnv('PAYPAL_ENV', 'sandbox') as 'sandbox' | 'live',
  },
  RESEND_API_KEY: getEnv('RESEND_API_KEY'),
  SMTP: {
    EMAIL: getEnv('SMTP_EMAIL'),
    PASSWORD: getEnv('SMTP_PASSWORD'),
  },
  R2: {
    ACCOUNT_ID: getRequiredEnv('R2_ACCOUNT_ID'),
    ACCESS_KEY_ID: getRequiredEnv('R2_ACCESS_KEY_ID'),
    SECRET_ACCESS_KEY: getRequiredEnv('R2_SECRET_ACCESS_KEY'),
    BUCKET_NAME: getRequiredEnv('R2_BUCKET_NAME'),
  },
  UPSTASH: {
    REDIS_REST_URL: getEnv('UPSTASH_REDIS_REST_URL'),
    REDIS_REST_TOKEN: getEnv('UPSTASH_REDIS_REST_TOKEN'),
  },
  SENTRY: {
    DSN: getEnv('NEXT_PUBLIC_SENTRY_DSN'),
    SERVER_DSN: getEnv('SENTRY_DSN'),
    AUTH_TOKEN: getEnv('SENTRY_AUTH_TOKEN'),
  },
} as const;

export type EnvConfig = typeof ENV;