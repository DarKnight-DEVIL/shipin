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

/**
 * Register is called once when the Next.js server starts.
 * We use it to validate that all production-required environment variables
 * are set, so the server fails fast instead of accepting requests with
 * a misconfigured deployment.
 */
export async function register() {
  // Validate production-required env vars (PAYPAL_WEBHOOK_ID and the shared
  // rate-limit store).
  try {
    validateProductionRequiredEnv();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);

    // Throwing alone is not enough: Next logs "an error occurred while loading
    // the instrumentation hook" and keeps the server up, answering every
    // request with a 500. A deployment missing its rate-limit store (or the
    // PayPal webhook id) must not take traffic at all, so the process exits
    // non-zero and the platform rolls the deployment back.
    //
    // The edge runtime has no `process.exit`; there the throw is all we can do.
    if (process.env.NEXT_RUNTIME !== 'edge') {
      process.exit(1);
    }

    throw error;
  }

  // Warn (never throw) when production has no shared rate-limit store: limits
  // are then per-instance, the proxy fails open on infrastructure failures, and
  // /api/health reports `degraded` so monitoring can see it. Crashing at boot
  // would deny service over a variable a human can fix live, and it made a
  // production build impossible to run without a real Upstash database.
  reportRateLimitStoreStatus();

  // Validate that every route under src/app/api is classified
  // (public/customer/admin). The proxy rejects unclassified routes with a 500,
  // so a route missing from the table is a broken endpoint, not a warning:
  // throw (and exit below) rather than serving it.
  //
  // The enumerator reads the source tree, so it is imported dynamically and
  // only on a Node runtime — the edge bundle cannot import `node:fs`.
  if (process.env.NEXT_RUNTIME !== 'edge') {
    try {
      const { assertAllRoutesClassified } = await import('@/config/routeClassification');
      const report = assertAllRoutesClassified(`${process.cwd()}/src/app/api`);

      if (report.skipped) {
        // Expected for a deployed bundle that ships compiled output without src/.
        // routeClassification.test.ts enforces the same invariant in CI, so this
        // is a notice rather than a degraded state.
        console.warn(`[instrumentation] route classification check skipped: ${report.skipped}`);
      }
    } catch (error) {
      // Same reasoning as the env check above: a throw alone leaves Next serving
      // 500s for the affected endpoints, so the deployment must fail instead.
      console.error(error instanceof Error ? error.message : error);
      process.exit(1);
    }
  }

  // Warn (never throw) when App Check is enforced without a site key: every
  // browser request is rejected in that state, but crashing at boot would take
  // the deployment down for a configuration a human can fix live. Logged here,
  // surfaced as `degraded` by /api/health.
  reportAppCheckStatus();
}