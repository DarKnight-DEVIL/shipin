/**
 * Next.js instrumentation hook.
 *
 * Runs once when a new Next.js server instance is initiated, before the
 * server is ready to handle requests. Used for startup validation.
 */

import { childLogger } from "@/lib/logger";
import { appCheckLogger } from "@/lib/appCheck";
import { getAppCheckAlertTarget } from "@/lib/appCheckMetrics";

import { isProduction, validateProductionRequiredEnv } from "@/config/env";
import { reportAppCheckStatus } from "@/lib/appCheck";
import { reportClientIpTrust } from "@/lib/clientIp";
import { reportRateLimitStoreStatus } from "@/lib/redisRateLimiter";

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

  // `process.exit` is Node-only, and this module is compiled for the edge
  // runtime as well. A literal `process.exit()` call there is reported as an
  // Edge Runtime error on every compile ("A Node.js API is used (process.exit
  // at line: 32)"), even though the guard below makes it unreachable on edge.
  // Reaching the function through `globalThis` keeps it out of the bundler's
  // static Node-API analysis; the runtime check is still what protects us.
  const runtimeProcess = (globalThis as { process?: NodeJS.Process }).process;
  if (
    process.env.NEXT_RUNTIME !== "edge" &&
    typeof runtimeProcess?.exit === "function"
  ) {
    runtimeProcess.exit(1);
  }

  throw error;
}

let appCheckClient: ((app?: import("firebase-admin/app").App) => import("firebase-admin/app-check").AppCheck) | null = null;
export { appCheckClient };

export async function register() {
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

  // Same pattern for the trust boundary that decides whose budget a request
  // spends. Without it every caller shares one bucket, which on a self-hosted
  // deployment is a site-wide 30 requests a minute — the warning is the only
  // place a human can see that before the 429s start.
  if (process.env.NEXT_RUNTIME !== "edge") {
    await reportClientIpTrust();
  }

  // Same pattern for the carrier feed: without the India Post credentials the
  // tracking page serves the disclosed placeholder feed in production. That is
  // a degraded deployment monitoring must see, not an outage worth causing.
  if (process.env.NEXT_RUNTIME !== "edge") {
    const { reportIndiaPostStatus } = await import(
      "@/features/shipments/carriers"
    );
    reportIndiaPostStatus();
  }

  // Validate that every route under src/app/api is classified
  // (public/customer/admin). The proxy rejects unclassified routes with a 500,
  // so a route missing from the table is a broken endpoint, not a warning:
  // throw (and exit below) rather than serving it.
  //
  // Imported dynamically and only on a Node runtime: the edge build has no use
  // for a startup check that ends in `process.exit`. The route list itself is a
  // generated static array, so nothing here touches the filesystem.
  if (process.env.NEXT_RUNTIME !== "edge") {
    try {
      const { assertAllRoutesClassified } =
        await import("@/config/routeClassification");
      const report = assertAllRoutesClassified();

      if (report.skipped) {
        // Expected for a deployed bundle that ships compiled output without src/.
        // routeClassification.test.ts enforces the same invariant in CI, so this
        // is a notice rather than a degraded state.
        const instrumentationLogger = childLogger({ service: "instrumentation" });
        instrumentationLogger.warn(
          `[instrumentation] route classification check skipped: ${report.skipped}`
        );
      }
    } catch (error) {
      // Same reasoning as the env check above: a throw alone leaves Next serving
      // 500s for the affected endpoints, so the deployment must fail instead.
      failBoot(error);
    }
  }

  // Initialize App Check client once at boot to avoid per-request dynamic import overhead.
  // The dynamic import in verifyAppCheckRequest avoids ERR_REQUIRE_ESM at module scope,
  // but after this boot-time initialization we can reuse the same instance.
  try {
    const { getAppCheck } = await import("firebase-admin/app-check");
    appCheckClient = getAppCheck;

    appCheckLogger.info("[AppCheck] Client initialized at boot");
  } catch {
    // If boot-time initialization fails (e.g., ERR_REQUIRE_ESM on edge),
    // fall back to per-request dynamic imports in verifyAppCheckRequest.
    appCheckLogger.warn("[AppCheck] Boot-time client initialization failed, using per-request imports");
  }

  // Warn (never throw) when App Check is enforced without a site key: every
  // browser request is rejected in that state, but crashing at boot would take
  // the deployment down for a configuration a human can fix live. Logged here,
  // surfaced as `degraded` by /api/health.
  reportAppCheckStatus();

  // A quota outage is silent without a channel to announce it: the probe that
  // would catch it is only useful if something watches it. Say so once at boot
  // instead of discovering it during an incident.
  if (isProduction && process.env.NEXT_RUNTIME !== "edge") {
    const alertTarget = getAppCheckAlertTarget();
    if (!alertTarget.configured) {
      childLogger({ service: "instrumentation" }).warn(
        "[instrumentation] no alert webhook is configured: set APP_CHECK_ALERT_WEBHOOK_URL (or BREACH_ALERT_WEBHOOK_URL) so an App Check quota outage pages someone, and monitor /api/health regardless"
      );
    }
  }
}
