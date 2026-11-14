/**
 * Next.js instrumentation hook.
 *
 * Runs once when a new Next.js server instance is initiated, before the
 * server is ready to handle requests. Used for startup validation and
 * observability setup.
 */

import { validateProductionRequiredEnv } from '@/config/env';
import { reportRateLimitStoreStatus } from '@/lib/redisRateLimiter';

/**
 * Register is called once when the Next.js server starts.
 * We use it to validate that all production-required environment variables
 * are set, so the server fails fast instead of accepting requests with
 * a misconfigured deployment.
 */
export function register() {
  // Validate production-required env vars (e.g. PAYPAL_WEBHOOK_ID).
  // Throws if any are missing when running in production.
  validateProductionRequiredEnv();

  // Warn (never throw) if the rate-limiting shared store is missing in
  // production. Per-instance in-memory limits cannot enforce global limits
  // across serverless regions, but crashing at boot made the entire app —
  // sign-in included — unreachable over a rate-limit dependency. The gap is
  // logged here and surfaced as `degraded` by /api/health.
  reportRateLimitStoreStatus();
}