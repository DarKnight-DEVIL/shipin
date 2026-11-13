/**
 * Integration tests for the login-intent API route.
 * Tests the rate limiting and response structure.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock dependencies
vi.mock('@/lib/rateLimiter', () => ({
  loginRateLimiter: {
    record: vi.fn(),
  },
  isRateLimited: vi.fn(),
  addRateLimitHeaders: vi.fn(),
}));

vi.mock('@/utils/errors', () => ({
  withErrorHandler: (handler: unknown) => handler,
}));

import { loginRateLimiter, isRateLimited, addRateLimitHeaders } from '@/lib/rateLimiter';
import { POST } from './route';

const mockLoginRateLimiter = vi.mocked(loginRateLimiter);
const mockIsRateLimited = vi.mocked(isRateLimited);
const mockAddRateLimitHeaders = vi.mocked(addRateLimitHeaders);

function createMockRequest(headers: Record<string, string> = {}): Request {
  return {
    headers: {
      get: (key: string) => headers[key.toLowerCase()] || null,
    },
  } as unknown as Request;
}

describe('POST /api/auth/login-intent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Mirror the real helper so the route's header contract is exercised;
    // `afterEach` resets implementations, so this must be set every test.
    mockAddRateLimitHeaders.mockImplementation(
      (
        headers: Headers,
        result: { limit: number; remaining: number; reset: number }
      ) => {
        headers.set('X-RateLimit-Limit', String(result.limit));
        headers.set('X-RateLimit-Remaining', String(result.remaining));
        headers.set('X-RateLimit-Reset', String(Math.floor(result.reset / 1000)));
      }
    );
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('allows request when under rate limit', async () => {
    mockLoginRateLimiter.record.mockResolvedValue({
      ok: true,
      limit: 5,
      remaining: 4,
      reset: Date.now() + 60000,
    });
    mockIsRateLimited.mockReturnValue(false);

    const request = createMockRequest({ 'cf-connecting-ip': '1.2.3.4' });
    const response = await POST(request);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.allowed).toBe(true);
    expect(typeof body.reset).toBe('number');
  });

  it('returns 429 when rate limited', async () => {
    mockLoginRateLimiter.record.mockResolvedValue({
      ok: false,
      limit: 5,
      remaining: 0,
      reset: Date.now() + 60000,
    });
    mockIsRateLimited.mockReturnValue(true);

    const request = createMockRequest({ 'cf-connecting-ip': '1.2.3.4' });
    const response = await POST(request);

    expect(response.status).toBe(429);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.code).toBe('RATE_LIMIT_ERROR');
    expect(body.error).toContain('sign-in attempts');
  });

  it('includes rate limit headers in response', async () => {
    mockLoginRateLimiter.record.mockResolvedValue({
      ok: true,
      limit: 5,
      remaining: 4,
      reset: 1234567890,
    });
    mockIsRateLimited.mockReturnValue(false);

    const request = createMockRequest({ 'cf-connecting-ip': '1.2.3.4' });
    const response = await POST(request);

    expect(response.headers.get('X-RateLimit-Limit')).toBe('5');
    expect(response.headers.get('X-RateLimit-Remaining')).toBe('4');
    // The helper emits the reset as epoch seconds, not milliseconds.
    expect(response.headers.get('X-RateLimit-Reset')).toBe('1234567');
  });
});