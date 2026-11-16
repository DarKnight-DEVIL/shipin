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
/**
 * Refuse to boot on a configuration that would serve broken endpoints.
 *
 * Throwing alone is not enough: Next logs "an error occurred while loading the
 * instrumentation hook" and keeps the server up, answering requests with 500s.
 * Exiting non-zero makes the platform roll the deployment back. The edge
 * runtime has no `process.exit`, so there the throw is all we can do — hence the
 * single guarded exit here rather than one per call site.
 */
function failBoot(error: unknown): never {
  console.error(error instanceof Error ? error.message : error);

  if (process.env.NEXT_RUNTIME !== 'edge') {
    process.exit(1);
  }

  throw error;
}

export async function register() {
  // Error reporting first, so a crash later in this hook is captured. Each
  // runtime imports only its own config; the SDK is disabled without a DSN, so
  // this is a no-op in development and in CI.
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('../sentry.server.config');
  } else if (process.env.NEXT_RUNTIME === 'edge') {
    await import('../sentry.edge.config');
  }

  // Validate production-required env vars (PAYPAL_WEBHOOK_ID and the shared
  // rate-limit store).
  try {
    validateProductionRequiredEnv();
  } catch (error) {
    failBoot(error);
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
      const report = assertAllRoutesClassified();

      if (report.skipped) {
        // Expected for a deployed bundle that ships compiled output without src/.
        // routeClassification.test.ts enforces the same invariant in CI, so this
        // is a notice rather than a degraded state.
        console.warn(`[instrumentation] route classification check skipped: ${report.skipped}`);
      }
    } catch (error) {
      // Same reasoning as the env check above: a throw alone leaves Next serving
      // 500s for the affected endpoints, so the deployment must fail instead.
      failBoot(error);
    }
  }

  // Warn (never throw) when App Check is enforced without a site key: every
  // browser request is rejected in that state, but crashing at boot would take
  // the deployment down for a configuration a human can fix live. Logged here,
  // surfaced as `degraded` by /api/health.
  reportAppCheckStatus();
}

/**
 * Report errors that escape a route handler or server component.
 *
 * Next calls this for every server-side request error; without it the SDK only
 * sees errors a route caught itself, which is exactly the set that never
 * reaches a user-visible 500. Loaded dynamically so the unit tests and the edge
 * bundle do not pay for the SDK import.
 */
export async function onRequestError(
  ...args: Parameters<typeof import('@sentry/nextjs').captureRequestError>
) {
  try {
    const { captureRequestError } = await import('@sentry/nextjs');
    captureRequestError(...args);
  } catch {
    // Error reporting must never break the error path.
  }
}