/**
 * Lightweight in-memory sliding-window rate limiter.
 *
 * Limits are per runtime instance, not global across serverless instances.
 * Use an edge/WAF or shared store for production-wide enforcement.
 */

type IpHistoryEntry = { timestamp: number };
type IpHistory = Record<string, IpHistoryEntry[]>;

import { createSharedRateLimiter } from "./redisRateLimiter";

export interface RateLimitPolicy {
  maxRequests: number;
  windowMs: number;
  message: string;
  /** Exact pathname values that should bypass this limiter. */
  skipRoutes?: string[];
}

export interface RateLimitResult {
  ok: boolean;
  limit: number;
  remaining: number;
  reset: number;
}

class InMemoryRateLimiter {
  private readonly store: IpHistory = Object.create(null) as IpHistory;
  private readonly policy: RateLimitPolicy;

  constructor(policy: RateLimitPolicy) {
    this.policy = policy;
  }

  private getClientIp(request: Request): string {
    // These headers are only trustworthy when set/overwritten by your trusted
    // hosting proxy. Do not expose the app directly to untrusted clients.
    const cfIp = request.headers.get("cf-connecting-ip")?.trim();
    if (cfIp) return cfIp;

    const forwarded = request.headers.get("x-forwarded-for");
    if (forwarded) {
      const first = forwarded.split(",")[0]?.trim();
      if (first) return first;
    }

    return request.headers.get("x-real-ip")?.trim() || "127.0.0.1";
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

  async record(request: Request): Promise<RateLimitResult> {
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
    const ip = this.getClientIp(request);
    const history = (this.store[ip] ??= []).filter(
      (entry) => now - entry.timestamp < this.policy.windowMs
    );
    this.store[ip] = history;

    const limit = this.policy.maxRequests;
    const oldest = history[0]?.timestamp;
    const reset = oldest === undefined ? now + this.policy.windowMs : oldest + this.policy.windowMs;

    if (history.length >= limit) {
      return { ok: false, limit, remaining: 0, reset };
    }

    history.push({ timestamp: now });
    return { ok: true, limit, remaining: limit - history.length, reset };
  }
}

const DEFAULT_POLICY: RateLimitPolicy = {
  maxRequests: 100,
  windowMs: 60_000,
  message: "Too many requests, please try again later.",
};

// In-memory instances (used as fallback when Redis is not configured)
const webLimiterMemory = new InMemoryRateLimiter(DEFAULT_POLICY);
const apiLimiterMemory = new InMemoryRateLimiter({
  maxRequests: 30,
  windowMs: 60_000,
  message: "Too many requests, please try again later.",
});
const strictLimiterMemory = new InMemoryRateLimiter({
  maxRequests: 10,
  windowMs: 60_000,
  message: "Too many requests, please try again later.",
});
const loginLimiterMemory = new InMemoryRateLimiter({
  maxRequests: 5,
  windowMs: 60_000,
  message: "Too many sign-in attempts, please wait a moment and try again.",
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
  30,
  60_000,
  apiLimiterMemory
);

export const strictRateLimiter = createSharedRateLimiter(
  "strict",
  10,
  60_000,
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
  5,
  60_000,
  loginLimiterMemory
);

export function isRateLimited(result: RateLimitResult): boolean {
  return !result.ok;
}

export function addRateLimitHeaders(headers: Headers, result: RateLimitResult): void {
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
