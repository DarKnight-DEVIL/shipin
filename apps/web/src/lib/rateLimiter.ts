/**
 * Sliding-window rate limiting for the request proxy.
 *
 * The exported limiters are Redis-backed (see `redisRateLimiter`), so limits are
 * shared across serverless instances. The in-memory implementations below are
 * only the development/test fallback — and in production `redisRateLimiter`
 * fails closed rather than degrading to per-instance limits when no store is
 * configured.
 */

import {
  API_RATE_LIMIT,
  LOGIN_RATE_LIMIT,
  RATE_LIMIT_WINDOW_MS,
  STRICT_RATE_LIMIT,
  WEB_RATE_LIMIT,
} from "@/config/constants";

import { createSharedRateLimiter } from "./redisRateLimiter";
import type { RateLimitResult } from "./redisRateLimiter";
import { getClientIp } from "./clientIp";

export interface RateLimitPolicy {
  maxRequests: number;
  windowMs: number;
  message: string;
  /** Exact pathname values that should bypass this limiter. */
  skipRoutes?: string[];
}

export interface SharedRateLimiter {
  record(request: Request): Promise<RateLimitResult>;
  getErrorCounts(
    since: number
  ): Promise<Array<{ ip: string; errors: number; lastErrorAt: number }>>;
}

export class InMemoryRateLimiter {
  private readonly store: Record<string, { timestamp: number }[]> = {};
  private readonly policy: RateLimitPolicy;

  constructor(policy: RateLimitPolicy) {
    this.policy = policy;

    // record() prunes, so a busy limiter stays small. A limiter that goes
    // quiet keeps its last buckets forever in a long-lived process, so sweep
    // once per window as well. unref keeps the timer from holding the process
    // open at shutdown.
    const timer = setInterval(() => this.prune(Date.now()), policy.windowMs);
    timer.unref?.();
  }

  /** Number of address buckets currently held; used by tests and diagnostics. */
  get trackedBuckets(): number {
    return Object.keys(this.store).length;
  }

  private resolveClientIp(request: Request): string {
    // See clientIp.ts: only headers the deployment platform sanitises are
    // trusted, so a client cannot mint a fresh bucket per request. Without one
    // every caller shares the loopback bucket rather than escaping the limit.
    return getClientIp(request) ?? "127.0.0.1";
  }

  private prune(now: number): void {
    for (const ip of Object.keys(this.store)) {
      const active = this.store[ip].filter(
        (entry) => now - entry.timestamp < this.policy.windowMs
      );
      if (active.length) this.store[ip] = active;
      else delete this.store[ip];
    }
  }

  async record(
    request: Request
  ): Promise<import("./redisRateLimiter").RateLimitResult> {
    const now = Date.now();
    const pathname = new URL(request.url).pathname;
    if (this.policy.skipRoutes?.includes(pathname)) {
      return {
        ok: true,
        limit: this.policy.maxRequests,
        remaining: this.policy.maxRequests,
        reset: now + this.policy.windowMs,
      };
    }

    this.prune(now);
    const ip = this.resolveClientIp(request);
    const history = (this.store[ip] ??= []).filter(
      (entry) => now - entry.timestamp < this.policy.windowMs
    );
    this.store[ip] = history;

    const limit = this.policy.maxRequests;
    const oldest = history[0]?.timestamp;
    const reset =
      oldest === undefined
        ? now + this.policy.windowMs
        : oldest + this.policy.windowMs;

    if (history.length >= limit) {
      return { ok: false, limit, remaining: 0, reset };
    }

    history.push({ timestamp: now });
    return { ok: true, limit, remaining: limit - history.length, reset };
  }
}

// Every budget comes from `@/config/constants`, which documents itself as the
// one place limits live. The literals here used to repeat those numbers, so a
// change in the constants left the real limiter enforcing the old value.
const DEFAULT_POLICY: RateLimitPolicy = {
  maxRequests: WEB_RATE_LIMIT,
  windowMs: RATE_LIMIT_WINDOW_MS,
  message: "Too many requests, please try again later.",
};

// In-memory instances (used as fallback when Redis is not configured)
const webLimiterMemory = new InMemoryRateLimiter(DEFAULT_POLICY);
const apiLimiterMemory = new InMemoryRateLimiter({
  maxRequests: API_RATE_LIMIT,
  windowMs: RATE_LIMIT_WINDOW_MS,
  message: "Too many requests, please try again later.",
});
const strictLimiterMemory = new InMemoryRateLimiter({
  maxRequests: STRICT_RATE_LIMIT,
  windowMs: RATE_LIMIT_WINDOW_MS,
  message: "Too many requests, please try again later.",
});
const loginLimiterMemory = new InMemoryRateLimiter({
  maxRequests: LOGIN_RATE_LIMIT,
  windowMs: RATE_LIMIT_WINDOW_MS,
  message: "Too many sign-in attempts, please wait a moment and try again.",
});
const authEntryLimiterMemory = new InMemoryRateLimiter({
  // The entry pages share the API budget: generous for a person retrying a
  // sign-in, tight enough to meter a scripted flood.
  maxRequests: API_RATE_LIMIT,
  windowMs: RATE_LIMIT_WINDOW_MS,
  message: "Too many requests, please try again later.",
});

// Shared (Redis-backed) wrappers — fall back to in-memory if no Redis config
export const webRateLimiter = createSharedRateLimiter(
  "web",
  DEFAULT_POLICY.maxRequests,
  DEFAULT_POLICY.windowMs,
  webLimiterMemory
);

export const apiRateLimiter = createSharedRateLimiter(
  "api",
  API_RATE_LIMIT,
  RATE_LIMIT_WINDOW_MS,
  apiLimiterMemory
);

export const strictRateLimiter = createSharedRateLimiter(
  "strict",
  STRICT_RATE_LIMIT,
  RATE_LIMIT_WINDOW_MS,
  strictLimiterMemory
);

/**
 * Sign-in attempt limiter.
 *
 * Each Google popup/redirect attempt is gated through
 * POST /api/auth/login-intent. 5 attempts per IP per
 * minute is plenty for legitimate use and stops
 * credential-stuffing / popup-spam loops.
 */
export const loginRateLimiter = createSharedRateLimiter(
  "login",
  LOGIN_RATE_LIMIT,
  RATE_LIMIT_WINDOW_MS,
  loginLimiterMemory
);

/**
 * Sign-in entry page limiter (/login, /verify-email).
 *
 * These pages used to skip rate limiting entirely, which left the cheapest
 * paths for credential spraying and email enumeration completely unmetered.
 * They now share a generous budget — a person retrying a failing sign-in is
 * never blocked, a scripted flood is — while the fail-open path below still
 * applies when the shared store itself is unreachable, so an outage cannot
 * lock everyone out of signing in.
 */
export const authEntryRateLimiter = createSharedRateLimiter(
  "auth-entry",
  API_RATE_LIMIT,
  RATE_LIMIT_WINDOW_MS,
  authEntryLimiterMemory
);

export function isRateLimited(
  result: import("./redisRateLimiter").RateLimitResult
): boolean {
  return !result.ok;
}

export function addRateLimitHeaders(
  headers: Headers,
  result: import("./redisRateLimiter").RateLimitResult
): void {
  headers.set("X-RateLimit-Limit", String(result.limit));
  headers.set("X-RateLimit-Remaining", String(result.remaining));
  headers.set("X-RateLimit-Reset", String(Math.floor(result.reset / 1000)));
  if (!result.ok) {
    headers.set(
      "Retry-After",
      String(Math.max(1, Math.ceil((result.reset - Date.now()) / 1000)))
    );
  }
}
