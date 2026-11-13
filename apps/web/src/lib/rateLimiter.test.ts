/**
 * Unit tests for the rate-limiter helpers exposed by `rateLimiter.ts`.
 *
 * The limiter mechanics themselves are covered by
 * `InMemoryRateLimiter.test.ts` and the Redis dispatch/fallback by
 * `redisRateLimiter.test.ts`, so this suite only covers the response helpers.
 */

import { describe, it, expect } from 'vitest';

import { isRateLimited, addRateLimitHeaders } from './rateLimiter';

describe('isRateLimited', () => {
  it('is true only when the limiter rejected the request', () => {
    expect(isRateLimited({ ok: false, limit: 5, remaining: 0, reset: 0 })).toBe(true);
    expect(isRateLimited({ ok: true, limit: 5, remaining: 4, reset: 0 })).toBe(false);
  });
});

describe('addRateLimitHeaders', () => {
  it('publishes the limit, remaining count and reset time in seconds', () => {
    const headers = new Headers();
    const reset = Date.now() + 60_000;

    addRateLimitHeaders(headers, { ok: true, limit: 100, remaining: 99, reset });

    expect(headers.get('X-RateLimit-Limit')).toBe('100');
    expect(headers.get('X-RateLimit-Remaining')).toBe('99');
    expect(headers.get('X-RateLimit-Reset')).toBe(String(Math.floor(reset / 1000)));
    expect(headers.has('Retry-After')).toBe(false);
  });

  it('adds Retry-After when the request is rate limited', () => {
    const headers = new Headers();

    addRateLimitHeaders(headers, {
      ok: false,
      limit: 5,
      remaining: 0,
      reset: Date.now() + 30_000,
    });

    expect(headers.get('Retry-After')).toMatch(/^\d+$/);
    expect(Number(headers.get('Retry-After'))).toBeGreaterThan(0);
  });

  it('never advertises a Retry-After below one second', () => {
    const headers = new Headers();

    addRateLimitHeaders(headers, {
      ok: false,
      limit: 5,
      remaining: 0,
      reset: Date.now() - 5_000,
    });

    expect(headers.get('Retry-After')).toBe('1');
  });
});
