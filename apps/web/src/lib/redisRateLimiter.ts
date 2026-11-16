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
 *   - If UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_TOKEN are not set in production,
 *     the process THROWS at startup (fail-fast). Per-instance in-memory limits
 *     cannot enforce global limits across serverless regions.
 *   - In development/test, falls back to in-memory limiter when Redis not configured.
 *   - If Redis is configured but a call fails (network error, timeout),
 *     the limiter FAILS CLOSED: the request is rejected with a 429.
 *     This prevents an attacker from silently bypassing limits during
 *     a Redis outage. See {@link reportRedisError} for monitoring hooks.
 *   - Counters are keyed by IP with a route prefix so the web, api,
 *     strict, and login limits don't share a bucket.
 *   - Ratelimit instances are created ONCE per limiter name (singleton pattern)
 *     to avoid connection overhead and Upstash connection limits.
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
 * Describe the state of the shared rate-limit store.
 * Throws in production if store is missing (fail-fast).
 */
export function getRateLimitStoreStatus(): RateLimitStoreStatus {
  const url = serverEnv.UPSTASH_REDIS_REST_URL;
  const token = serverEnv.UPSTASH_REDIS_REST_TOKEN;
  const configured = isValidRedisUrl(url) && Boolean(token);
  const degraded = isProduction && !configured;
  if (degraded) {
    throw new Error(
      "[RateLimiter] UPSTASH_REDIS_REST_URL and/or UPSTASH_REDIS_REST_TOKEN are not set in production. " +
        "Rate limits cannot be enforced globally across serverless regions. " +
        "Set both variables in the production environment."
    );
  }
  return { configured, degraded };
}

/**
 * Validate the store status at startup. Throws in production if store is missing.
 */
export function reportRateLimitStoreStatus(): RateLimitStoreStatus {
  return getRateLimitStoreStatus();
}

// --- Redis client & Ratelimit instances (lazy singletons) ---

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

// Cache of created Ratelimit instances per limiter name to avoid
// creating a new instance on every request (which wastes CPU and
// may hit Upstash connection limits).
const ratelimitInstances = new Map<string, Ratelimit>();

function getRatelimitInstance(name: string, maxRequests: number, windowMs: number): Ratelimit | null {
  const client = getRedis();
  if (!client) return null;
  
  const key = `${name}:${maxRequests}:${windowMs}`;
  let instance = ratelimitInstances.get(key);
  if (!instance) {
    instance = new Ratelimit({
      redis: client,
      limiter: Ratelimit.slidingWindow(
        maxRequests,
        `${Math.round(windowMs / 1000)} s`
      ),
      prefix: `shipin:${name}`,
    });
    ratelimitInstances.set(key, instance);
  }
  return instance;
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

      const limiter = getRatelimitInstance(name, maxRequests, windowMs);
      if (!limiter) {
        if (isProduction) {
          // This should never happen because getRateLimitStoreStatus() throws
          // at startup if Redis is not configured in production.
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