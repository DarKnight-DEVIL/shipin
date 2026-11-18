/**
 * Tests for the request proxy (`src/proxy.ts`).
 *
 * The proxy is the first thing that runs for every page request, so a mistake
 * here takes routes offline before any route handler or layout can react. The
 * two behaviours that matter for sign-in:
 *
 *   - `/login` and `/verify-email` get their own generous limiter, so a burst
 *     of retries never sees a 429 but a scripted flood is still metered.
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
  web: { record: vi.fn().mockResolvedValue({ ok: true, limit: 10, remaining: 9, reset: 0 }) },
  api: { record: vi.fn().mockResolvedValue({ ok: true, limit: 10, remaining: 9, reset: 0 }) },
  authEntry: { record: vi.fn().mockResolvedValue({ ok: true, limit: 30, remaining: 29, reset: 0 }) },
}));

vi.mock('@/lib/rateLimiter', () => ({
  webRateLimiter: state.web,
  apiRateLimiter: state.api,
  authEntryRateLimiter: state.authEntry,
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
    // Mirrors the real map: the proxy only overrides it for indexable routes.
    'X-Robots-Tag': 'noindex, nofollow',
  },
  getProductionCSP: () => 'default-src self',
  getDevCSP: () => "default-src self 'unsafe-eval'",
}));

vi.mock('@/lib/cors', () => ({
  isAllowedOrigin: () => true,
  getCorsHeaders: () => ({ 'Access-Control-Allow-Origin': '*' }),
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
  state.authEntry.record.mockReset().mockResolvedValue(allowed);
});

describe('proxy: sign-in entry points use the lenient limiter', () => {
  it.each(['/login', '/verify-email'])(
    'meters %s through the auth-entry limiter only',
    async (pathname) => {
      const response = await proxy(requestFor(pathname));

      expect(state.authEntry.record).toHaveBeenCalledTimes(1);
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

  it('still renders /login when the shared limiter store is unavailable', async () => {
    // Fail-open on infrastructure: an unreachable store must never lock
    // everyone out of signing in.
    state.authEntry.record.mockResolvedValue(unavailable);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const response = await proxy(requestFor('/login'));

    expect(response.status).toBe(200);
    expect(response.headers.get('x-middleware-next')).toBe('1');

    warn.mockRestore();
  });

  it('rejects a genuine /login flood with 429', async () => {
    state.authEntry.record.mockResolvedValue(overLimit);

    const response = await proxy(requestFor('/login'));

    expect(response.status).toBe(429);
  });

  it('meters nested auth subpaths and keeps the security headers', async () => {
    const response = await proxy(requestFor('/login/help'));

    expect(state.authEntry.record).toHaveBeenCalledTimes(1);
    expect(state.web.record).not.toHaveBeenCalled();
    expect(response.status).toBe(200);
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
  });
});

describe('proxy: page responses stay cacheable', () => {
  it.each(['/', '/dashboard', '/login'])(
    'sets no Set-Cookie for %s',
    async (pathname) => {
      // A Set-Cookie on an HTML response makes it uncacheable at the edge, and
      // nothing in the app reads a cookie for authentication on these routes.
      const response = await proxy(requestFor(pathname));

      expect(response.headers.get('set-cookie')).toBeNull();
    }
  );

  it.each(['/', '/login', '/track', '/dashboard'])(
    'leaves Cache-Control to Next for %s',
    async (pathname) => {
      // Next emits `s-maxage=31536000` on prerendered HTML. Any value from the
      // proxy would replace it, and `no-store` here would silently undo the
      // cacheability that removing the cookie bought.
      const response = await proxy(requestFor(pathname));

      expect(response.headers.get('cache-control')).toBeNull();
    }
  );

  it('advertises no CSRF header in CORS', async () => {
    const response = await proxy(requestFor('/dashboard'));

    expect(response.headers.get('Access-Control-Allow-Headers')).toBe(
      'Content-Type, Authorization, X-Requested-With, X-Firebase-AppCheck'
    );
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
    // Degradation is reported once at startup and through /api/health, not per
    // request: otherwise every request in this state adds a log line.
    expect(warn).not.toHaveBeenCalled();

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
  it('marks public marketing and legal pages indexable', async () => {
    for (const route of ['/', '/track', '/privacy-policy', '/terms']) {
      const response = await proxy(requestFor(route));

      expect(response.headers.get('X-Robots-Tag'), route).toBe('index, follow');
    }
  });

  it('keeps signed-in pages and the login route out of the index', async () => {
    for (const route of [
      '/login',
      '/requests',
      '/wallet',
      '/addresses',
      '/settings',
      '/notifications',
      '/support',
      '/dashboard',
    ]) {
      const response = await proxy(requestFor(route));

      expect(response.headers.get('X-Robots-Tag'), route).toBe('noindex, nofollow');
    }
  });

  it('rate limits ordinary pages through the web limiter', async () => {
    const response = await proxy(requestFor('/dashboard'));

    expect(state.web.record).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(200);
    expect(response.headers.get('X-RateLimit-Limit')).toBe('100');
  });
});
