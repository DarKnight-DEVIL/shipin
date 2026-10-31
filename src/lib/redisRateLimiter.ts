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

import type { RateLimitResult } from "./rateLimiter";

const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;

const redis =
  redisUrl && redisToken
    ? new Redis({ url: redisUrl, token: redisToken })
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
        // Fail open: a Redis outage must not lock everyone out of the app.
        console.error(
          `Shared rate limiter (${name}) failed, falling back to in-memory:`,
          error instanceof Error ? error.message : error
        );
        return fallback.record(request);
      }
    },
  };
}