/**
 * GET /api/health
 *
 * Readiness probe for uptime monitors and load balancers. Public by design
 * (no auth) and exposes only non-sensitive operational state — never
 * credentials or customer data.
 *
 * Status semantics:
 *   healthy    200 — a shared rate-limit store is configured (production)
 *                    and no limiter errors occurred in the last window.
 *   degraded   200 — the app still serves traffic, but the shared rate
 *                    limiter failed recently, or production is running with
 *                    no shared store (per-instance limits only). Alert on
 *                    this; do not treat it as fully healthy.
 *
 * A missing shared store never produces a non-200: the process has always been
 * able to serve requests in that state, and returning 503 made load balancers
 * and uptime monitors mark a working deployment as down.
 *
 * The `appCheck` block reports the two independent switches: whether clients
 * hold a site key (`configured`) and whether routes reject tokens it cannot
 * verify (`enforced`). Enforcement without a site key is reported as
 * `misconfigured`: every browser request would fail the check, because the
 * client has no way to mint a token.
 *
 * That combination also makes the whole deployment `degraded`. It is the one
 * configuration where the process is up, Redis is fine, and yet every single
 * browser request is rejected — a deployment that answers `healthy` in that
 * state is invisible to uptime monitors until a human notices nobody can sign
 * in.
 */

import { NextResponse } from "next/server";

import { isProduction, serverEnv } from "@/config/env";
import { getAppCheckStatus } from "@/lib/appCheck";
import {
  apiRateLimiter,
  loginRateLimiter,
  strictRateLimiter,
  webRateLimiter,
} from "@/lib/rateLimiter";
import { RATE_LIMIT_ERROR_WINDOW_MS } from "@/lib/redisRateLimiter";

export async function GET() {
  const redisConfigured = Boolean(
    serverEnv.UPSTASH_REDIS_REST_URL && serverEnv.UPSTASH_REDIS_REST_TOKEN
  );
  // In production a missing store means per-instance limits. The app keeps
  // serving (and logs a startup warning), so this is degraded, not down.
  const missingSharedStore = isProduction && !redisConfigured;

  // Two independent switches, reported separately so a half-configured
  // deployment is visible instead of looking either fully on or fully off. The
  // mapping lives in `lib/appCheck` so this route and the startup warning are
  // reading one definition.
  const {
    configured: appCheckConfigured,
    enforced: appCheckEnforced,
    status: appCheckStatus,
  } = getAppCheckStatus();
  // Enforced without a site key is not a warning: the API rejects every browser
  // request, so this deployment cannot serve users at all.
  const appCheckBroken = appCheckStatus === "misconfigured";

  // Relative to this request, not to module load: a long-lived instance must
  // not keep reporting errors from hours ago as "recent".
  const cutoff = Date.now() - RATE_LIMIT_ERROR_WINDOW_MS;

  const limiters: Array<{ name: string; limiter: typeof webRateLimiter }> = [
    { name: "web", limiter: webRateLimiter },
    { name: "api", limiter: apiRateLimiter },
    { name: "strict", limiter: strictRateLimiter },
    { name: "login", limiter: loginRateLimiter },
  ];

  const redisErrors = limiters.map(({ name, limiter }) => {
    const recent = limiter.getErrorCounts(cutoff);
    const all = limiter.getErrorCounts(0);
    return {
      name,
      // Number of failed Redis calls, not the number of affected clients:
      // one client erroring repeatedly must not read as a single error.
      recentErrors: recent.reduce((sum, entry) => sum + entry.errors, 0),
      affectedClients: recent.length,
      totalErrors: all.reduce((sum, entry) => sum + entry.errors, 0),
    };
  });

  const hasRecentErrors = redisErrors.some((e) => e.recentErrors > 0);
  const degraded = missingSharedStore || hasRecentErrors || appCheckBroken;
  const status = degraded ? "degraded" : "healthy";

  return NextResponse.json(
    {
      status,
      checkedAt: new Date().toISOString(),
      redis: {
        configured: redisConfigured,
        status: redisConfigured
          ? "connected"
          : isProduction
            ? "missing"
            : "fallback (in-memory, development only)",
      },
      appCheck: {
        configured: appCheckConfigured,
        enforced: appCheckEnforced,
        status: appCheckStatus,
        ...(appCheckBroken
          ? {
              warning:
                "APP_CHECK_ENFORCEMENT is on but NEXT_PUBLIC_FIREBASE_APP_CHECK_SITE_KEY is empty: clients cannot mint an App Check token, so API requests are rejected with APP_CHECK_FAILED.",
            }
          : {}),
      },
      rateLimits: {
        windowMs: "5m",
        errors: redisErrors,
        totalRecentErrors: redisErrors.reduce((sum, e) => sum + e.recentErrors, 0),
      },
      ...(missingSharedStore
        ? {
            warning:
              "UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are not set in production; rate limits are per-instance.",
          }
        : {}),
      ...(isProduction && hasRecentErrors
        ? {
            redisErrorDetails: redisErrors.flatMap((e) =>
              e.recentErrors > 0
                ? limiters
                    .find((l) => l.name === e.name)!
                    .limiter.getErrorCounts(cutoff)
                    .map((err) => ({
                      limiter: e.name,
                      ip: err.ip,
                      count: err.errors,
                      lastErrorAt: new Date(err.lastErrorAt).toISOString(),
                    }))
                : []
            ),
          }
        : {}),
    },
    { status: 200 }
  );
}
