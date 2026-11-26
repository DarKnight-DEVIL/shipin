/**
 * The server environment variable names the app expects, as data.
 *
 * Separate from `index.ts` on purpose: that module builds the `serverEnv` proxy and
 * is mocked wholesale in tests, so a test that needs the NAME LIST cannot import it
 * from there. Keeping the lists here means one definition, read by both the runtime
 * schema and `turboEnv.test.ts` - which exists because Turbo strips any variable it
 * is not told about, and the first Vercel build of the CSP work warned about exactly
 * that while still going green.
 */

export const PRODUCTION_REQUIRED_SERVER_ENV: ReadonlySet<string> = new Set([
  "PAYPAL_WEBHOOK_ID",
]);

export const OPTIONAL_SERVER_ENV: ReadonlySet<string> = new Set([
  "PAYPAL_API_URL",
  // PAYPAL_WEBHOOK_ID is listed in PRODUCTION_REQUIRED_SERVER_ENV instead:
  // it may be absent in dev/test, but must be set in production.
  // UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN are not optional in
  // production: see RATE_LIMIT_STORE_SERVER_ENV in ./production.ts. When absent
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
  "BREACH_ALERT_WEBHOOK_URL",
  "APP_CHECK_ALERT_WEBHOOK_URL",
]);
