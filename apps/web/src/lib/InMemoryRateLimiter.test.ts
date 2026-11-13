/**
 * Unit tests for the in-memory rate limiter (InMemoryRateLimiter).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { InMemoryRateLimiter } from './rateLimiter';

function createRequest(headers: Record<string, string> = {}, url = 'http://example.com/api/test'): Request {
  return {
    headers: new Map(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v])),
    url,
    method: 'POST',
    clone: function() { return this; },
    json: async () => ({}),
    text: async () => JSON.stringify({}),
  } as unknown as Request;
}

describe('InMemoryRateLimiter', () => {
  let limiter: InMemoryRateLimiter;

  beforeEach(() => {
    limiter = new InMemoryRateLimiter({ maxRequests: 5, windowMs: 60_000, message: 'Test limit' });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('allows requests under the limit', async () => {
    const req = createRequest({ 'cf-connecting-ip': '1.2.3.4' });
    for (let i = 0; i < 5; i++) {
      const result = await limiter.record(req);
      expect(result.ok).toBe(true);
      expect(result.limit).toBe(5);
      expect(result.remaining).toBe(4 - i);
    }
  });

  it('rejects the 6th request from the same IP', async () => {
    const req = createRequest({ 'cf-connecting-ip': '1.2.3.4' });
    for (let i = 0; i < 5; i++) await limiter.record(req);
    const result = await limiter.record(req);
    expect(result.ok).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it('tracks different IPs independently', async () => {
    const req1 = createRequest({ 'cf-connecting-ip': '1.2.3.4' });
    const req2 = createRequest({ 'cf-connecting-ip': '5.6.7.8' });
    for (let i = 0; i < 5; i++) await limiter.record(req1);
    const result = await limiter.record(req2);
    expect(result.ok).toBe(true);
    expect(result.remaining).toBe(4);
  });

  it('falls back to x-forwarded-for when cf-connecting-ip is missing', async () => {
    const req = createRequest({ 'x-forwarded-for': '203.0.113.195, 70.41.3.18' });
    const result = await limiter.record(req);
    expect(result.ok).toBe(true);
  });

  it('falls back to 127.0.0.1 when no trusted headers present', async () => {
    const req = createRequest({});
    const result = await limiter.record(req);
    expect(result.ok).toBe(true);
  });

  it('ignores client-controlled x-real-ip so limits cannot be bypassed', async () => {
    const spoofed = createRequest({ 'x-real-ip': '9.9.9.9' });
    for (let i = 0; i < 5; i++) await limiter.record(spoofed);

    // The spoofed header must not create a fresh bucket.
    expect((await limiter.record(spoofed)).ok).toBe(false);
    // Nor may a different spoofed value buy another bucket.
    expect((await limiter.record(createRequest({ 'x-real-ip': '8.8.8.8' }))).ok).toBe(false);
  });

  it('skips routes listed in skipRoutes', async () => {
    const skipLimiter = new InMemoryRateLimiter({
      maxRequests: 1,
      windowMs: 60_000,
      message: 'Test',
      skipRoutes: ['/api/health'],
    });
    const req = createRequest({ 'cf-connecting-ip': '1.2.3.4' }, 'http://example.com/api/health');
    const result = await skipLimiter.record(req);
    expect(result.ok).toBe(true);
    expect(result.remaining).toBe(1);
  });

  it('resets after the window expires', async () => {
    vi.useFakeTimers();
    try {
      const windowLimiter = new InMemoryRateLimiter({ maxRequests: 1, windowMs: 1000, message: 'Test' });
      const req = createRequest({ 'cf-connecting-ip': '1.2.3.4' });
      await windowLimiter.record(req);
      expect((await windowLimiter.record(req)).ok).toBe(false);
      await vi.advanceTimersByTimeAsync(1100);
      expect((await windowLimiter.record(req)).ok).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});