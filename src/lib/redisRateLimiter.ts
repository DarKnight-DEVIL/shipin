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
 *   - If UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN are not set,
 *     every record() falls back to the provided in-memory limiter.
 *   - If Redis is configured but a call fails (network error, timeout),
 *     the limiter FAILS OPEN: it logs and lets the request through
 *     rather than taking the whole site down because Redis blipped.
 *   - Counters are keyed by IP with a route prefix so the web, api,
 *     strict, and login limits don't share a bucket.
 */

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

import { serverEnv } from "@/config/env";

export interface RateLimitResult {
  ok: boolean;
  limit: number;
  remaining: number;
  reset: number;
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

const redis =
  isValidRedisUrl(serverEnv.UPSTASH_REDIS_REST_URL) &&
  serverEnv.UPSTASH_REDIS_REST_TOKEN
    ? new Redis({
        url: serverEnv.UPSTASH_REDIS_REST_URL,
        token: serverEnv.UPSTASH_REDIS_REST_TOKEN,
      })
    : null;

export function createSharedRateLimiter(
  name: string,
  maxRequests: number,
  windowMs: number,
  fallback: { record: (req: Request) => Promise<RateLimitResult> }
) {
  const limiter = redis
    ? new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(
          maxRequests,
          `${Math.round(windowMs / 1000)} s`
        ),
        prefix: `shipin:${name}`,
      })
    : null;

  return {
    async record(request: Request): Promise<RateLimitResult> {
      if (!limiter) {
        // No Redis configured → use in-memory fallback
        return fallback.record(request);
      }

      const ip =
        request.headers.get("cf-connecting-ip")?.trim() ||
        request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
        request.headers.get("x-real-ip")?.trim() ||
        "127.0.0.1";

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
        // Instead, reject the request and let the fallback be used ONLY when
        // Redis is explicitly not configured (not on transient errors).
        console.error(
          `Shared rate limiter (${name}) failed, rejecting request:`,
          error instanceof Error ? error.message : error
        );
        return {
          ok: false,
          limit: maxRequests,
          remaining: 0,
          reset: Date.now() + windowMs,
        };
      }
    },
  };
}