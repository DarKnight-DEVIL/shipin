/**
 * GET /api/health
 *
 * Readiness probe for uptime monitors and load balancers. Public by design
 * (no auth) and exposes only non-sensitive operational state — never
 * credentials or customer data.
 *
 * That includes client addresses. The limiter error counters are keyed by IP so
 * an operator can find an abusive client in the logs, but this route reports
 * them only as aggregate counts and a last-failure timestamp: it is
 * unauthenticated, so a per-address row here would publish a partial list of
 * live user IPs to anyone who asks.
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

import { isProduction } from "@/config/env";
import { getAppCheckStatus } from "@/lib/appCheck";
import {
  readAlertDeliveryStatus,
  readErrorCounts,
  resolveErrorAlertWebhook,
} from "@/lib/errorTracking";
import { mfaDenylistStatus } from "@/lib/mfaDenylist";
import {
  apiRateLimiter,
  loginRateLimiter,
  strictRateLimiter,
  webRateLimiter,
} from "@/lib/rateLimiter";
import {
  getRateLimitStoreStatus,
  RATE_LIMIT_ERROR_WINDOW_MS,
} from "@/lib/redisRateLimiter";
import { getIndiaPostStatus } from "@/features/shipments/carriers";
import {
  getAppCheckAlertTarget,
  readAppCheckRejections,
  reportAppCheckSpike,
} from "@/lib/appCheckMetrics";
import {
  readOutboundRejections,
  reportOutboundSpike,
} from "@/lib/outboundMetrics";

export async function GET() {
  // One derivation, shared with the limiter that enforces the limits. The
  // variables being set is not the same as the store working: a URL that is not
  // https never produces a Ratelimit instance, so every `record()` call returns
  // `unavailable` and the proxy serves the request unmetered. Reporting
  // `connected` for that state is the one thing this probe must not do, which
  // is why the decision lives in `getRateLimitStoreStatus` and not here.
  //
  // In production a missing store means per-instance limits (none, in effect).
  // The app keeps serving and logs a startup warning, so it is degraded, not
  // down.
  const { configured: redisConfigured, degraded: missingSharedStore } =
    getRateLimitStoreStatus();

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

  // A spike of APP_CHECK_FAILED rejections means clients cannot mint App Check
  // tokens at all — reCAPTCHA quota exhausted or attestation broken. Sign-in
  // still works (it never touches these routes) but every API call is
  // rejected, so the deployment is degraded and the on-call gets one Discord
  // alert per outage window.
  const appCheckRejections = await readAppCheckRejections();
  const appCheckSpike = appCheckRejections.spike;

  /*
   * A spike of OUTBOUND_RATE_LIMITED refusals means something is flooding one
   * recipient — an abusive caller, a loop, a misconfigured flow. The recipient
   * sees silence rather than an error, so this probe is the signal; the
   * buckets refill on their own, so the fix is in the calling code, not a
   * restart. One Discord alert per outage window, like the App Check spike.
   */
  const outboundRejections = await readOutboundRejections();
  const outboundSpike = outboundRejections.spike;

  /*
   * Tracked failures, by category, over the last ten minutes. This is what makes
   * the alerting legible to a monitor: a payment-drift or mfa-store event turns
   * up here even when no webhook is configured, which is the one state where an
   * operator channel cannot be relied on.
   */
  const errorCounts = await readErrorCounts();
  const alertDelivery = await readAlertDeliveryStatus();
  const alerted = reportAppCheckSpike(appCheckRejections);
  const outboundAlerted = reportOutboundSpike(outboundRejections);

  // Whether an outage could page anyone at all. This does not affect `status`
  // on its own — a deployment without a webhook is still serving correctly —
  // but a monitor that only reads `status` cannot learn about a quota outage
  // in that state, so it is published explicitly.
  const alertTarget = getAppCheckAlertTarget();

  // Relative to this request, not to module load: a long-lived instance must
  // not keep reporting errors from hours ago as "recent".
  const cutoff = Date.now() - RATE_LIMIT_ERROR_WINDOW_MS;

  // The carrier feed shares the rate-limit store's reporting contract: missing
  // credentials in production keep the app serving (the tracking page
  // discloses the placeholder) but mark the deployment degraded.
  const { configured: indiaPostConfigured, degraded: trackingPlaceholder } =
    getIndiaPostStatus();

  const limiters: Array<{ name: string; limiter: typeof webRateLimiter }> = [
    { name: "web", limiter: webRateLimiter },
    { name: "api", limiter: apiRateLimiter },
    { name: "strict", limiter: strictRateLimiter },
    { name: "login", limiter: loginRateLimiter },
  ];

  const redisErrors = await Promise.all(
    limiters.map(async ({ name, limiter }) => {
      const recent = await limiter.getErrorCounts(cutoff);
      const all = await limiter.getErrorCounts(0);
      return {
        name,
        // Number of failed Redis calls, not the number of affected clients:
        // one client erroring repeatedly must not read as a single error.
        recentErrors: recent.reduce((sum, entry) => sum + entry.errors, 0),
        affectedClients: recent.length,
        totalErrors: all.reduce((sum, entry) => sum + entry.errors, 0),
        // When the most recent failure happened, or null if none did. This is as
        // much per-client detail as a public probe may carry: the rows behind it
        // are keyed by client address, and those addresses are customer data.
        lastErrorAt:
          recent.length > 0
            ? new Date(
                Math.max(...recent.map((entry) => entry.lastErrorAt))
              ).toISOString()
            : null,
      };
    })
  );

  const hasRecentErrors = redisErrors.some((e) => e.recentErrors > 0);

  /*
   * The MFA revocation list, as this instance currently sees it. `degraded: true` means
   * elevation sessions are being accepted without a revocation check - the one state in
   * which a revoked admin could still be working - so it has to be visible here rather
   * than only in the logs.
   */
  const mfaDenylist = mfaDenylistStatus();

  const degraded =
    missingSharedStore ||
    hasRecentErrors ||
    appCheckBroken ||
    trackingPlaceholder ||
    appCheckSpike ||
    outboundSpike ||
    mfaDenylist.degraded;
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
      errors: {
        trackedLast10Min: errorCounts.recent,
        byCategory: errorCounts.byCategory,
        bySeverity: errorCounts.bySeverity,
        alertWebhookConfigured: Boolean(resolveErrorAlertWebhook()),
      },
      appCheck: {
        configured: appCheckConfigured,
        enforced: appCheckEnforced,
        status: appCheckStatus,
        rejectionsLast10Min: appCheckRejections.recentRejections,
        rejectionsMissingToken: appCheckRejections.missing,
        rejectionsInvalidToken: appCheckRejections.invalid,
        invalidTokenReasons: appCheckRejections.invalidReasons,
        ...(appCheckSpike
          ? {
              warning:
                "Clients cannot mint App Check tokens — reCAPTCHA quota exhausted or attestation broken. Sign-in still works; every API call is rejected. Emergency fix: set APP_CHECK_ENFORCEMENT=false and redeploy.",
            }
          : {}),
        ...(appCheckBroken
          ? {
              warning:
                "APP_CHECK_ENFORCEMENT is on but NEXT_PUBLIC_FIREBASE_APP_CHECK_SITE_KEY is empty: clients cannot mint an App Check token, so API requests are rejected with APP_CHECK_FAILED.",
            }
          : {}),
      },
      ...(alerted ? { appCheckSpikeAlerted: true } : {}),
      outbound: {
        rejectionsLast10Min: outboundRejections.rejectionsLast10Min,
        byChannel: outboundRejections.byChannel,
        spike: outboundRejections.spike,
        ...(outboundRejections.spike
          ? {
              warning:
                "Outbound sends are being rate-limited faster than the buckets refill — a recipient is being flooded. Find the caller by its OUTBOUND_RATE_LIMITED errors; the buckets refill on their own.",
            }
          : {}),
      },
      ...(outboundAlerted ? { outboundSpikeAlerted: true } : {}),
      alerting: {
        webhook: alertTarget.source,
        recentDeliveryFailures: alertDelivery.recentFailures,
        ...(alertDelivery.recentFailures > 0
          ? {
              warning:
                "Alert deliveries to the operator webhook failed recently — check the webhook URL and the sink's status; incidents in this window were logged but may not have paged anyone.",
            }
          : {}),        ...(isProduction && !alertTarget.configured
          ? {
              warning:
                "No alert webhook is configured (APP_CHECK_ALERT_WEBHOOK_URL), so an App Check quota outage would be reported only by this probe. Set it to a Discord webhook URL or alert on status != healthy.",
            }
          : {}),
      },
      rateLimits: {
        windowMs: "5m",
        errors: redisErrors,
        totalRecentErrors: redisErrors.reduce(
          (sum, e) => sum + e.recentErrors,
          0
        ),
        ...(isProduction && hasRecentErrors
          ? {
              warning:
                "The shared rate-limit store is failing; rate limits are not being enforced reliably. Per-client detail stays in the server logs.",
            }
          : {}),
      },
      mfaDenylist,
      tracking: {
        configured: indiaPostConfigured,
        status: indiaPostConfigured
          ? "india-post"
          : isProduction
            ? "placeholder"
            : "placeholder (development only)",
      },
      ...(missingSharedStore
        ? {
            warning:
              "UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are not set in production; rate limits are per-instance.",
          }
        : {}),
      ...(trackingPlaceholder
        ? {
            trackingWarning:
              "INDIA_POST_TRACKING_URL / INDIA_POST_CLIENT_ID / INDIA_POST_CLIENT_SECRET are not fully set in production; customer tracking serves the placeholder feed.",
          }
        : {}),
    },
    { status: 200 }
  );
}
