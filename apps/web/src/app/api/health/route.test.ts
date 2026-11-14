/**
 * Tests for GET /api/health.
 *
 * The route is the readiness probe used by uptime monitors, so its status
 * codes matter as much as its body: a production deployment without a shared
 * rate-limit store still serves traffic, so it reports 200 with a `degraded`
 * status and a warning rather than claiming the deployment is down.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const state = vi.hoisted(() => ({
  isProduction: false,
  url: '',
  token: '',
  errors: { web: 0, api: 0, strict: 0, login: 0 } as Record<string, number>,
}));

vi.mock('@/config/env', () => ({
  get isProduction() {
    return state.isProduction;
  },
  serverEnv: {
    get UPSTASH_REDIS_REST_URL() {
      return state.url;
    },
    get UPSTASH_REDIS_REST_TOKEN() {
      return state.token;
    },
  },
}));

vi.mock('@/lib/rateLimiter', () => {
  const makeLimiter = (name: string) => ({
    record: vi.fn(),
    getErrorCounts: () => {
      const errors = state.errors[name] ?? 0;
      return errors > 0 ? [{ ip: '203.0.113.5', errors, lastErrorAt: Date.now() }] : [];
    },
  });

  return {
    webRateLimiter: makeLimiter('web'),
    apiRateLimiter: makeLimiter('api'),
    strictRateLimiter: makeLimiter('strict'),
    loginRateLimiter: makeLimiter('login'),
  };
});

vi.mock('@/lib/redisRateLimiter', () => ({
  RATE_LIMIT_ERROR_WINDOW_MS: 5 * 60 * 1000,
}));

import { GET } from './route';

beforeEach(() => {
  state.isProduction = false;
  state.url = '';
  state.token = '';
  state.errors = { web: 0, api: 0, strict: 0, login: 0 };
});

describe('GET /api/health', () => {
  it('reports healthy with the in-memory fallback in development', async () => {
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe('healthy');
    expect(body.redis.configured).toBe(false);
    expect(body.redis.status).toContain('fallback');
    expect(body.checkedAt).toEqual(expect.any(String));
  });

  it('reports degraded with 200 when production has no shared store', async () => {
    state.isProduction = true;

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe('degraded');
    expect(body.redis.configured).toBe(false);
    expect(body.redis.status).toBe('missing');
    expect(body.warning).toContain('UPSTASH_REDIS_REST_URL');
  });

  it('reports healthy when production has Redis and no limiter errors', async () => {
    state.isProduction = true;
    state.url = 'https://t.upstash.io';
    state.token = 'tok';

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe('healthy');
    expect(body.redis.status).toBe('connected');
  });

  it('reports degraded and exposes error details when Redis is failing', async () => {
    state.isProduction = true;
    state.url = 'https://t.upstash.io';
    state.token = 'tok';
    state.errors.api = 3;

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe('degraded');
    expect(body.rateLimits.totalRecentErrors).toBe(3);
    expect(body.redisErrorDetails).toEqual([
      expect.objectContaining({ limiter: 'api', ip: '203.0.113.5', count: 3 }),
    ]);
  });
});
