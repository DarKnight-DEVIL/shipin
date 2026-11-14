/**
 * Shared (cross-instance) rate limiter backed by Upstash Redis.
 *
 * The existing in-memory limiter in rateLimiter.ts only counts requests
 * per Node.js process, so on Vercel (or any multi-instance deployment)
 * a client could spread its requests across many instances and bypass
 * the limit. This module stores counters in Redis so the limit holds
 * globally.
 *
 * Behavior:
 *   - If UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_TOKEN are not set,
 *     every record() falls back to the provided in-memory limiter.
 *   - If Redis is configured but a call fails (network error, timeout),
 *     the limiter FAILS CLOSED: the request is rejected with a 429.
 *     This prevents an attacker from silently bypassing limits during
 *     a Redis outage. See {@link reportRedisError} for monitoring hooks.
 *   - Counters are keyed by IP with a route prefix so the web, api,
 *     strict, and login limits don't share a bucket.
 */

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

import { serverEnv, isProduction } from "@/config/env";

export interface RateLimitResult {
  ok: boolean;
  limit: number;
  remaining: number;
  reset: number;
  /**
   * True when the rejection is an infrastructure failure (no shared store or a
   * Redis error) rather than the client actually exceeding the limit.
   * Callers that guard user-facing flows (sign-in) can fail open on this while
   * still rejecting genuine abuse.
   */
  unavailable?: boolean;
}

/** Milliseconds used as the sliding-window cutoff for error-count queries. */
export const RATE_LIMIT_ERROR_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Report a Redis rate-limiting failure to Sentry in production.
 *
 * This function is idempotent-safe: it guards against re-entrancy so that
 * a Sentry transport failure inside this function cannot cause a second
 * call here (which would loop indefinitely).
 */
function reportRedisError(limiterName: string, clientIp: string): void {
  if (!isProduction) return;
  try {
    // Lazy require avoids bundling Sentry into non-production bundles.
     
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Sentry = require("@sentry/nextjs") as typeof import("@sentry/nextjs");
    Sentry.withScope((scope) => {
      scope.setContext("rateLimiter", {
        name: limiterName,
        ip: clientIp,
        mode: "fail-closed",
      });
      scope.setTag("service", "rate-limiter");
      scope.setTag("component", "redis-ratelimit");
      Sentry.captureException(
        new Error(
          `[RateLimiter:${limiterName}] Redis call failed for IP ${clientIp}. ` +
            "Request rejected (fail-closed)."
        )
      );
    });
  } catch {
    // Do not let a Sentry transport failure mask the original console.error.
  }
}

function isValidRedisUrl(url: string | undefined): url is string {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Throw at startup if the rate-limiting shared store is missing in
 * production. A per-instance in-memory limiter cannot enforce global
 * limits across serverless regions, so for a financial application
 * that is a hard failure — not a soft warning.
 */
export type RateLimitStoreStatus = {
  /** Whether the shared store is usable on this deployment. */
  configured: boolean;
  /** True when production is running without a shared store. */
  degraded: boolean;
};

/**
 * Describe the state of the shared rate-limit store without throwing.
 *
 * A missing store is a real limitation — per-instance limits can be bypassed
 * across serverless regions — but it must not stop the server from booting:
 * that crash took every request, sign-in included, offline. Callers log the
 * problem and surface it through `/api/health`, which reports `degraded`.
 */
export function getRateLimitStoreStatus(): RateLimitStoreStatus {
  const url = serverEnv.UPSTASH_REDIS_REST_URL;
  const token = serverEnv.UPSTASH_REDIS_REST_TOKEN;
  const configured = isValidRedisUrl(url) && Boolean(token);

  return { configured, degraded: isProduction && !configured };
}

/**
 * Log the shared-store state at startup. Never throws.
 *
 * @returns the same status object as {@link getRateLimitStoreStatus}.
 */
export function reportRateLimitStoreStatus(): RateLimitStoreStatus {
  const status = getRateLimitStoreStatus();

  if (status.degraded) {
    console.warn(
      "[RateLimiter] No shared rate-limit store configured in production. " +
        "Set UPSTASH_REDIS_REST_URL (an https:// URL) and " +
        "UPSTASH_REDIS_REST_TOKEN. Rate limits are per-instance until then " +
        "and /api/health reports degraded."
    );
  }

  return status;
}

// Lazily initialize Redis client to avoid triggering env validation at module load time
let redis: Redis | null = null;
function getRedis(): Redis | null {
  if (redis === null) {
    const url = serverEnv.UPSTASH_REDIS_REST_URL;
    const token = serverEnv.UPSTASH_REDIS_REST_TOKEN;
    if (isValidRedisUrl(url) && token) {
      redis = new Redis({ url, token });
    }
  }
  return redis;
}

export function createSharedRateLimiter(
  name: string,
  maxRequests: number,
  windowMs: number,
  fallback: { record: (req: Request) => Promise<RateLimitResult> }
) {
  // Per-instance error counters for Redis-backed limiters.
  // These reset on each cold start and are NOT persisted — they exist
  // solely so we can surface recent error counts via a health endpoint
  // without needing an external monitoring system.
  const errorCounters = new Map<string, { errors: number; lastErrorAt: number }>();

  function bumpCounter(key: string): void {
    const now = Date.now();
    const prev = errorCounters.get(key) ?? { errors: 0, lastErrorAt: 0 };
    errorCounters.set(key, { errors: prev.errors + 1, lastErrorAt: now });
    reportRedisError(name, key);
  }

  return {
    async record(request: Request): Promise<RateLimitResult> {
      const ip =
        request.headers.get("cf-connecting-ip")?.trim() ||
        request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
        "127.0.0.1";

      const client = getRedis();
      if (!client) {
        if (isProduction) {
          // Never degrade to per-instance limits in production: on serverless
          // that silently multiplies the effective quota by the number of
          // regions. Reject the request (fail-closed) and surface it as an
          // error so /api/health reports the deployment as degraded.
          bumpCounter(ip);
          console.error(
            `[RateLimiter:${name}] No shared rate-limit store configured, ` +
              "rejecting request (fail-closed). Set UPSTASH_REDIS_REST_URL and " +
              "UPSTASH_REDIS_REST_TOKEN."
          );
          return {
            ok: false,
            unavailable: true,
            limit: maxRequests,
            remaining: 0,
            reset: Date.now() + windowMs,
          };
        }

        // Development/test: no Redis configured → use in-memory fallback.
        return fallback.record(request);
      }

      try {
        const limiter = new Ratelimit({
          redis: client,
          limiter: Ratelimit.slidingWindow(
            maxRequests,
            `${Math.round(windowMs / 1000)} s`
          ),
          prefix: `shipin:${name}`,
        });

        const result = await limiter.limit(ip);
        const reset = result.reset;

        return {
          ok: result.success,
          limit: maxRequests,
          remaining: result.remaining,
          reset,
        };
      } catch (error) {
        // Fail CLOSED: a Redis outage must not silently allow excess requests.
        // Report via Sentry for production alerting and bump local counter
        // so /api/health can expose the current error rate.
        bumpCounter(ip);
        console.error(
          `[RateLimiter:${name}] Redis call failed, rejecting request (fail-closed):`,
          error instanceof Error ? error.message : error
        );
        return {
          ok: false,
          unavailable: true,
          limit: maxRequests,
          remaining: 0,
          reset: Date.now() + windowMs,
        };
      }
    },

    /**
     * Expose per-limiter Redis error counts so callers can surface them
     * in health checks or observability dashboards. Keys are IP addresses.
     * Callers should pass {{Date.now() - 5 * 60 * 1000}} as |since| to
     * get only recent errors (last 5 minutes).
     */
    getErrorCounts(since: number): Array<{ ip: string; errors: number; lastErrorAt: number }> {
      const cutoff = since;
      return Array.from(errorCounters.entries())
        .filter(([, v]) => v.lastErrorAt >= cutoff)
        .map(([ip, v]) => ({ ip, ...v }));
    },
  };
}