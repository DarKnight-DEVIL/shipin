/**
 * Unit tests for the Redis-backed shared rate limiter.
 *
 * `@upstash/redis` and `@upstash/ratelimit` are mocked so no network calls are
 * made, which lets us exercise the three real paths: no Redis configured
 * (in-memory fallback), Redis answering, and Redis failing (fail-closed).
 */

import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';

// These suites rebuild their module graph per test (they reset modules so each
// case gets a fresh instance). That is cheap normally but can exceed the
// default 5s ceiling when the whole suite runs unisolated on a loaded machine,
// which surfaced as spurious timeouts. The assertions are unchanged.
vi.setConfig({ testTimeout: 15_000 });

const state = vi.hoisted(() => ({
  url: '',
  token: '',
  isProduction: false,
  limit: vi.fn(),
}));

vi.mock('@/config/env', () => ({
  serverEnv: {
    PAYPAL_ENV: 'sandbox',
    get UPSTASH_REDIS_REST_URL() {
      return state.url;
    },
    get UPSTASH_REDIS_REST_TOKEN() {
      return state.token;
    },
  },
  get isProduction() {
    return state.isProduction;
  },
  get isDevelopment() {
    return !state.isProduction;
  },
}));

vi.mock('@upstash/redis', () => ({
  Redis: class {
    constructor(_options: unknown) {}
  },
}));

vi.mock('@upstash/ratelimit', () => ({
  Ratelimit: class {
    static slidingWindow = vi.fn(() => ({}));

    limit = state.limit;

    constructor(_options: unknown) {}
  },
}));

// Imported per file instead of statically: with a shared module registry the
// first importer fixes which mocks this module binds to, so a static import
// can inherit another file's stub.
let createSharedRateLimiter: typeof import('./redisRateLimiter').createSharedRateLimiter;
let assertRateLimitStoreAvailable: typeof import('./redisRateLimiter').assertRateLimitStoreAvailable;
let RATE_LIMIT_ERROR_WINDOW_MS: typeof import('./redisRateLimiter').RATE_LIMIT_ERROR_WINDOW_MS;

beforeEach(async () => {
  vi.resetModules();
  ({
    createSharedRateLimiter,
    assertRateLimitStoreAvailable,
    RATE_LIMIT_ERROR_WINDOW_MS,
  } = await import('./redisRateLimiter'));
});

const fallbackResult = {
  ok: true,
  limit: 100,
  remaining: 100,
  reset: Date.now() + 60_000,
};

function makeFallback() {
  return { record: vi.fn(async () => fallbackResult) };
}

function requestWith(ip = '1.2.3.4') {
  return new Request('http://localhost:3000/api/test', {
    headers: { 'cf-connecting-ip': ip },
  });
}

function configureRedis() {
  state.url = 'https://t.upstash.io';
  state.token = 'tok';
}

beforeEach(() => {
  state.url = '';
  state.token = '';
  state.isProduction = false;
  state.limit.mockReset();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('RATE_LIMIT_ERROR_WINDOW_MS', () => {
  it('is 5 minutes in ms', () => {
    expect(RATE_LIMIT_ERROR_WINDOW_MS).toBe(5 * 60 * 1000);
  });
});

describe('createSharedRateLimiter without Redis configured', () => {
  it('delegates to the in-memory fallback', async () => {
    const fallback = makeFallback();
    const limiter = createSharedRateLimiter('web', 100, 60_000, fallback);

    const result = await limiter.record(requestWith());

    expect(result).toEqual(fallbackResult);
    expect(fallback.record).toHaveBeenCalledTimes(1);
    expect(state.limit).not.toHaveBeenCalled();
  });
});

describe('createSharedRateLimiter in production without a shared store', () => {
  it('fails closed instead of using per-instance limits', async () => {
    state.isProduction = true;
    const fallback = makeFallback();
    const limiter = createSharedRateLimiter('api', 30, 60_000, fallback);

    const result = await limiter.record(requestWith());

    expect(result.ok).toBe(false);
    expect(result.remaining).toBe(0);
    // Silent degradation to in-memory limits is exactly what must not happen.
    expect(fallback.record).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalled();
  });

  it('fails closed when the configured URL is not https', async () => {
    state.isProduction = true;
    state.url = 'http://insecure.example';
    state.token = 'tok';
    const fallback = makeFallback();
    const limiter = createSharedRateLimiter('api', 30, 60_000, fallback);

    const result = await limiter.record(requestWith());

    expect(result.ok).toBe(false);
    expect(fallback.record).not.toHaveBeenCalled();
  });
});

describe('createSharedRateLimiter with Redis configured', () => {
  it('allows requests Redis accepts and keys the limit by client IP', async () => {
    configureRedis();
    state.limit.mockResolvedValue({ success: true, remaining: 99, reset: 1_700_000_000_000 });
    const fallback = makeFallback();
    const limiter = createSharedRateLimiter('web', 100, 60_000, fallback);

    const result = await limiter.record(requestWith('203.0.113.9'));

    expect(result).toEqual({
      ok: true,
      limit: 100,
      remaining: 99,
      reset: 1_700_000_000_000,
    });
    expect(state.limit).toHaveBeenCalledWith('203.0.113.9');
    expect(fallback.record).not.toHaveBeenCalled();
  });

  it('passes through rejections from Redis', async () => {
    configureRedis();
    state.limit.mockResolvedValue({ success: false, remaining: 0, reset: 1_700_000_000_000 });
    const limiter = createSharedRateLimiter('api', 30, 60_000, makeFallback());

    const result = await limiter.record(requestWith());

    expect(result.ok).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it('fails closed when the Redis call throws', async () => {
    configureRedis();
    state.limit.mockRejectedValue(new Error('redis down'));
    const fallback = makeFallback();
    const limiter = createSharedRateLimiter('strict', 10, 60_000, fallback);
    const before = Date.now();

    const result = await limiter.record(requestWith('198.51.100.7'));

    expect(result.ok).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.reset).toBeGreaterThanOrEqual(before + 60_000);
    // Fail-closed must not silently fall back to the permissive in-memory path.
    expect(fallback.record).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalled();
  });

  it('records recent Redis errors per limiter for health reporting', async () => {
    configureRedis();
    state.limit.mockRejectedValue(new Error('redis down'));
    const limiter = createSharedRateLimiter('login', 5, 60_000, makeFallback());
    const other = createSharedRateLimiter('web', 100, 60_000, makeFallback());

    await limiter.record(requestWith('198.51.100.7'));

    expect(limiter.getErrorCounts(Date.now() - 60_000)).toEqual([
      { ip: '198.51.100.7', errors: 1, lastErrorAt: expect.any(Number) },
    ]);
    expect(limiter.getErrorCounts(Date.now() + 60_000)).toEqual([]);
    expect(other.getErrorCounts(0)).toEqual([]);
  });
});

describe('assertRateLimitStoreAvailable', () => {
  it('throws in production when the shared store is missing', () => {
    state.isProduction = true;

    expect(() => assertRateLimitStoreAvailable()).toThrow(
      'FATAL: Rate limiting requires a shared store'
    );
  });

  it('throws in production when the Redis URL is not https', () => {
    state.isProduction = true;
    state.url = 'http://insecure.example';
    state.token = 'tok';

    expect(() => assertRateLimitStoreAvailable()).toThrow(
      'FATAL: Rate limiting requires a shared store'
    );
  });

  it('throws in production when the token is missing', () => {
    state.isProduction = true;
    state.url = 'https://t.upstash.io';

    expect(() => assertRateLimitStoreAvailable()).toThrow(
      'FATAL: Rate limiting requires a shared store'
    );
  });

  it('accepts a complete production configuration', () => {
    state.isProduction = true;
    configureRedis();

    expect(() => assertRateLimitStoreAvailable()).not.toThrow();
  });

  it('never throws outside production', () => {
    expect(() => assertRateLimitStoreAvailable()).not.toThrow();
  });
});
