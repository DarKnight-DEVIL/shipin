/**
 * Environment variable requirements - single source of truth.
 *
 * Both index.ts (build-time) and production.ts (runtime preflight) import from here
 * so there's never a divergence between what the build validates and what the
 * deployment validates.
 */

/** Server-only vars that MUST be present at runtime. */
export const REQUIRED_SERVER_ENV: ReadonlySet<string> = new Set([
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
  // Admin MFA sessions cannot be signed without it. Moving to REQUIRED so
  // a missing secret fails at startup (build/start-preflight) instead of
  // 500-ing on the first admin request.
  "MFA_SESSION_SECRET",
]);

/**
 * Server-only vars that are REQUIRED in production but optional in dev/test.
 * In production, missing these will throw at startup.
 */
export const PRODUCTION_REQUIRED_SERVER_ENV: ReadonlySet<string> = new Set([
  "PAYPAL_WEBHOOK_ID",
]);

/**
 * Shared rate-limit store credentials: required in production, because
 * without them every instance limits on its own and the proxy fails open — a
 * misconfigured deploy would serve traffic with abuse protection off.
 *
 * Only the local/CI E2E suite (a production build against a throwaway
 * database) may opt out, via {@link RATE_LIMIT_STORE_OPTIONAL_ENV}.
 */
export const RATE_LIMIT_STORE_SERVER_ENV = [
  "UPSTASH_REDIS_REST_URL",
  "UPSTASH_REDIS_REST_TOKEN",
] as const;

/** Set to exactly "1" to allow booting production with no rate-limit store (E2E only). */
export const RATE_LIMIT_STORE_OPTIONAL_ENV = "RATE_LIMIT_STORE_OPTIONAL";

/** Any other value, including "true", keeps the store required. */
export function isRateLimitStoreOptional(): boolean {
  return process.env[RATE_LIMIT_STORE_OPTIONAL_ENV] === "1";
}

/** Set to exactly "1" to allow production boot without an MFA denylist store (E2E only). */
export const MFA_DENYLIST_OPTIONAL_ENV = "MFA_DENYLIST_OPTIONAL";

/** Any other value, including "true", keeps the store required. */
export function isMfaDenylistOptional(): boolean {
  return process.env[MFA_DENYLIST_OPTIONAL_ENV] === "1";
}

/** Server-only vars that fall back to a default when unset. */
export const DEFAULT_SERVER_ENV: Record<string, string> = {
  NODE_ENV: "development",
  PAYPAL_ENV: "sandbox",
  WHATSAPP_API_VERSION: "v25.0",
  R2_REGION: "auto",
};

/** Server-only vars that are optional (no default, no throw). */
export const OPTIONAL_SERVER_ENV: ReadonlySet<string> = new Set([
  "PAYPAL_API_URL",
  // PAYPAL_WEBHOOK_ID is listed in PRODUCTION_REQUIRED_SERVER_ENV instead:
  // it may be absent in dev/test, but must be set in production.
  // UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN are not optional in
  // production: see RATE_LIMIT_STORE_SERVER_ENV above. When they are absent
  // with the E2E opt-out set, startup warns and /api/health reports degraded.
  "WHATSAPP_ACCESS_TOKEN",
  "WHATSAPP_PHONE_NUMBER_ID",
  // MFA_SESSION_SECRET is NOT optional: it lives in PRODUCTION_REQUIRED_SERVER_ENV.
  "APP_CHECK_ENFORCEMENT",
  "R2_REGION",
  "R2_ENDPOINT",
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_SECURE",
  "SMTP_SERVICE",
  "INDIA_POST_TRACKING_URL",
  "INDIA_POST_CLIENT_ID",
  "INDIA_POST_CLIENT_SECRET",
  "CRON_SECRET",
]);