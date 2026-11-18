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
 *     the deployment is DEGRADED, not down: startup logs one warning, limits
 *     fall back to the per-instance in-memory path, and /api/health reports
 *     `degraded` so uptime monitoring can see the gap. Per-instance limits
 *     cannot enforce global limits across serverless regions, which is exactly
 *     why this must be visible rather than silent.
 *   - In development/test, falls back to in-memory limiter when Redis is not configured.
 *   - If Redis is configured but a call fails (network error, timeout), the
 *     limiter returns `unavailable`: the request is NOT rejected, because a
 *     store outage must never lock every user out (see the fail-open branch in
 *     `proxy.ts`). The failure is counted, reported to Sentry via
 *     {@link reportRedisError}, and surfaced by /api/health.
 *   - Genuine over-limit rejections (a reachable store saying "no") are 429s.
 *   - Counters are keyed by IP with a route prefix so the web, api,
 *     strict, and login limits don't share a bucket.
 *   - Ratelimit instances are created ONCE per limiter name (singleton pattern)
 *     to avoid connection overhead and Upstash connection limits.
 */

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

import { serverEnv, isProduction } from "@/config/env";
import { getClientIp } from "@/lib/clientIp";

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

/** Redis hash holding per-IP error counters, one per limiter. */
const ERROR_HASH_PREFIX = "shipin:ratelimit:errors:";
const ERROR_HASH_TTL_SECONDS = 10 * 60;

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
 *
 * Missing configuration in production is a degraded deployment, not a fatal
 * error. The proxy fails open on `unavailable` results and /api/health reports
 * `degraded`; throwing here contradicted both, and it meant no production
 * build could boot without a real Upstash database (local E2E, previews).
 */
export function getRateLimitStoreStatus(): RateLimitStoreStatus {
  const url = serverEnv.UPSTASH_REDIS_REST_URL;
  const token = serverEnv.UPSTASH_REDIS_REST_TOKEN;
  const configured = isValidRedisUrl(url) && Boolean(token);
  const degraded = isProduction && !configured;

  return { configured, degraded };
}

/**
 * Log the store status once at startup. Never throws: a missing store degrades
 * rate limiting, and taking the whole deployment down over a variable a human
 * can set live would deny service instead of protecting it.
 */
export function reportRateLimitStoreStatus(): RateLimitStoreStatus {
  const status = getRateLimitStoreStatus();

  if (status.degraded) {
    console.warn(
      "[RateLimiter] UPSTASH_REDIS_REST_URL and/or UPSTASH_REDIS_REST_TOKEN are not set in production. " +
        "Rate limits are per-instance only; /api/health reports this as degraded. " +
        "Set both variables to enforce limits across serverless regions."
    );
  }

  return status;
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

/**
 * The shared Redis client, or null when no store is configured.
 *
 * Exported for the few callers that need a counter rather than a sliding
 * window (the notification rate limit); Ratelimit instances stay private.
 */
export function getSharedRedisClient(): Redis | null {
  return getRedis();
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
  // Error counters are local *and* mirrored to Redis, so /api/health reports
  // the same totals from every instance. The local map stays the fallback for
  // when the store itself is unavailable.
  const errorCounters = new Map<string, { errors: number; lastErrorAt: number }>();

  function bumpCounter(key: string): void {
    const now = Date.now();
    const prev = errorCounters.get(key) ?? { errors: 0, lastErrorAt: 0 };
    const next = { errors: prev.errors + 1, lastErrorAt: now };
    errorCounters.set(key, next);
    reportRedisError(name, key);

    const client = getRedis();
    if (client) {
      // Fire and forget: health reporting must never delay or fail a request.
      void client
        .hset(ERROR_HASH_PREFIX + name, { [key]: JSON.stringify(next) })
        .then(() => client.expire(ERROR_HASH_PREFIX + name, ERROR_HASH_TTL_SECONDS))
        .catch(() => {
          /* counters are best effort */
        });
    }
  }

  return {
    async record(request: Request): Promise<RateLimitResult> {
      // One derivation, shared with the in-memory limiter and the consent
      // audit log; see `clientIp.ts` for which headers are trusted and why.
      const ip = getClientIp(request) ?? "127.0.0.1";

      const limiter = getRatelimitInstance(name, maxRequests, windowMs);
      if (!limiter) {
        if (isProduction) {
          // No shared store configured. Report it as an infrastructure failure
          // (so the caller may fail open and /api/health says `degraded`) rather
          // than as a client that exceeded its limit.
          //
          // No per-request log: `reportRateLimitStoreStatus` already warns once
          // at startup and /api/health reports the gap, so a line per request
          // only buried real errors in the local E2E output.
          bumpCounter(ip);
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
    async getErrorCounts(
      since: number
    ): Promise<Array<{ ip: string; errors: number; lastErrorAt: number }>> {
      const merged = new Map(errorCounters);
      const client = getRedis();

      if (client) {
        try {
          const stored = await client.hgetall<Record<string, unknown>>(
            ERROR_HASH_PREFIX + name
          );

          for (const [ip, raw] of Object.entries(stored ?? {})) {
            const parsed =
              typeof raw === "string"
                ? (JSON.parse(raw) as { errors?: unknown; lastErrorAt?: unknown })
                : (raw as { errors?: unknown; lastErrorAt?: unknown });

            const errors = Number(parsed?.errors);
            const lastErrorAt = Number(parsed?.lastErrorAt);
            if (!Number.isFinite(errors) || !Number.isFinite(lastErrorAt)) continue;

            const existing = merged.get(ip);
            merged.set(ip, {
              errors: Math.max(errors, existing?.errors ?? 0),
              lastErrorAt: Math.max(lastErrorAt, existing?.lastErrorAt ?? 0),
            });
          }
        } catch {
          // Keep the local counts; a store failure must not blank the health view.
        }
      }

      return Array.from(merged.entries())
        .filter(([, v]) => v.lastErrorAt >= since)
        .map(([ip, v]) => ({ ip, ...v }));
    },
  };
}