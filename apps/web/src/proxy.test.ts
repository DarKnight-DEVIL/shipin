/**
 * Tests for the request proxy (`src/proxy.ts`).
 *
 * The proxy is the first thing that runs for every page request, so a mistake
 * here takes routes offline before any route handler or layout can react. The
 * two behaviours that matter for sign-in:
 *
 *   - `/login` and `/verify-email` are never rate limited, so a burst of
 *     retries or an unhealthy limiter can never replace the sign-in form with
 *     a 429.
 *   - A limiter rejection caused by infrastructure (no shared store, Redis
 *     error) is not an abusive client and must fall through. Only a genuine
 *     over-limit result returns 429.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

type LimitResult = {
  ok: boolean;
  limit: number;
  remaining: number;
  reset: number;
  unavailable?: boolean;
};

const state = vi.hoisted(() => ({
  web: { record: vi.fn() },
  api: { record: vi.fn() },
}));

vi.mock('@/lib/rateLimiter', () => ({
  webRateLimiter: state.web,
  apiRateLimiter: state.api,
  // Mirrors the real implementation: any non-ok result is "limited".
  isRateLimited: (result: LimitResult) => !result.ok,
  addRateLimitHeaders: (headers: Headers, result: LimitResult) => {
    headers.set('X-RateLimit-Limit', String(result.limit));
    headers.set('X-RateLimit-Remaining', String(result.remaining));
  },
}));

vi.mock('@/lib/securityHeaders', () => ({
  SECURITY_HEADERS: {
    'Content-Security-Policy': 'default-src self',
    'X-Content-Type-Options': 'nosniff',
  },
  getProductionCSP: () => 'default-src self',
  getDevCSP: () => "default-src self 'unsafe-eval'",
}));

vi.mock('@/lib/cors', () => ({
  isAllowedOrigin: () => true,
  getCorsHeaders: () => ({ 'Access-Control-Allow-Origin': '*' }),
}));

vi.mock('@/lib/csrf', () => ({
  getCsrfTokenFromCookie: () => 'csrf-token',
}));

import proxy from './proxy';

const allowed: LimitResult = { ok: true, limit: 100, remaining: 99, reset: 0 };
const overLimit: LimitResult = { ok: false, limit: 100, remaining: 0, reset: 0 };
const unavailable: LimitResult = {
  ok: false,
  unavailable: true,
  limit: 100,
  remaining: 0,
  reset: 0,
};

function requestFor(pathname: string, init?: { method?: string; origin?: string }) {
  const headers = new Headers();
  if (init?.origin) headers.set('origin', init.origin);

  return new NextRequest(`https://shipin.test${pathname}`, {
    headers,
    ...(init?.method ? { method: init.method } : {}),
  });
}

beforeEach(() => {
  state.web.record.mockReset().mockResolvedValue(allowed);
  state.api.record.mockReset().mockResolvedValue(allowed);
});

describe('proxy: sign-in entry points are never rate limited', () => {
  it.each(['/login', '/verify-email'])(
    'does not consult the limiter for %s',
    async (pathname) => {
      const response = await proxy(requestFor(pathname));

      expect(state.web.record).not.toHaveBeenCalled();
      expect(state.api.record).not.toHaveBeenCalled();
      expect(response.status).toBe(200);
      // `NextResponse.next()` marks the pass-through and carries no JSON body,
      // so a 429 from the limiter can never be mistaken for a rendered page.
      expect(response.headers.get('x-middleware-next')).toBe('1');
      expect(response.headers.get('content-type') ?? '').not.toContain(
        'application/json'
      );
    }
  );

  it('still renders /login when the limiter would reject every request', async () => {
    // Fail-closed limiter state: every recorded request comes back rejected.
    state.web.record.mockResolvedValue(overLimit);
    state.api.record.mockResolvedValue(overLimit);

    const response = await proxy(requestFor('/login'));

    expect(response.status).toBe(200);
    expect(response.headers.get('X-RateLimit-Limit')).toBeNull();
  });

  it('skips the limiter for nested auth subpaths but keeps the security headers', async () => {
    const response = await proxy(requestFor('/login/help'));

    expect(state.web.record).not.toHaveBeenCalled();
    expect(response.status).toBe(200);
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
  });
});

describe('proxy: infrastructure failures fall through', () => {
  it('serves the page when the limiter reports an unavailable store', async () => {
    state.web.record.mockResolvedValue(unavailable);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const response = await proxy(requestFor('/dashboard'));

    expect(response.status).toBe(200);
    expect(response.headers.get('x-middleware-next')).toBe('1');
    expect(response.headers.get('content-type') ?? '').not.toContain(
      'application/json'
    );
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('rate-limit store unavailable')
    );

    warn.mockRestore();
  });

  it('rejects a genuine API over-limit with 429', async () => {
    state.api.record.mockResolvedValue(overLimit);

    const response = await proxy(requestFor('/api/requests'));

    expect(response.status).toBe(429);
    const body = await response.json();
    expect(body.code).toBe('RATE_LIMIT_ERROR');
  });

  it('does not apply the page limiter to API routes', async () => {
    await proxy(requestFor('/api/requests'));

    expect(state.api.record).toHaveBeenCalledTimes(1);
    expect(state.web.record).not.toHaveBeenCalled();
  });
});

describe('proxy: unrelated behaviour still holds', () => {
  it('lets the webhook bypass everything', async () => {
    const response = await proxy(requestFor('/api/webhook'));

    expect(state.api.record).not.toHaveBeenCalled();
    expect(response.status).toBe(200);
  });

  it('rate limits ordinary pages through the web limiter', async () => {
    const response = await proxy(requestFor('/dashboard'));

    expect(state.web.record).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(200);
    expect(response.headers.get('X-RateLimit-Limit')).toBe('100');
  });
});
