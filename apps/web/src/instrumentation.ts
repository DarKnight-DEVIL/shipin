/**
 * Next.js instrumentation hook.
 *
 * Runs once when a new Next.js server instance is initiated, before the
 * server is ready to handle requests. Used for startup validation and
 * observability setup.
 */

import { validateProductionRequiredEnv } from '@/config/env';
import { reportAppCheckStatus } from '@/lib/appCheck';
import { reportRateLimitStoreStatus } from '@/lib/redisRateLimiter';
import { validateRouteClassification } from '@/proxy';

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

  // Warn (never throw) when production has no shared rate-limit store: limits
  // are then per-instance, the proxy fails open on infrastructure failures, and
  // /api/health reports `degraded` so monitoring can see it. Crashing at boot
  // would deny service over a variable a human can fix live, and it made a
  // production build impossible to run without a real Upstash database.
  reportRateLimitStoreStatus();

  // Validate that all API routes are classified (public/customer/admin).
  // In production, unclassified routes cause a startup failure.
  validateRouteClassification();

  // Warn (never throw) when App Check is enforced without a site key: every
  // browser request is rejected in that state, but crashing at boot would take
  // the deployment down for a configuration a human can fix live. Logged here,
  // surfaced as `degraded` by /api/health.
  reportAppCheckStatus();
}