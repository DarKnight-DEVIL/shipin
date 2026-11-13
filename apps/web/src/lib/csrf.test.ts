/**
 * Tests for the double-submit CSRF helpers.
 */

import { describe, it, expect } from 'vitest';

import {
  createCsrfCookieHeader,
  enforceCsrf,
  generateCsrfToken,
  getCsrfTokenFromCookie,
  issueCsrfToken,
  validateCsrfToken,
} from './csrf';

/**
 * Minimal Request stub: `Cookie` is a forbidden header name, so constructing a
 * real Request silently drops it.
 */
function request(headers: Record<string, string>, method = 'POST'): Request {
  const map = new Map(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  return {
    method,
    url: 'https://shipin.test/api/thing',
    headers: { get: (name: string) => map.get(name.toLowerCase()) ?? null },
  } as unknown as Request;
}

describe('generateCsrfToken', () => {
  it('produces an unpadded base64url token with 256 bits of entropy', () => {
    const token = generateCsrfToken();

    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    // 32 random bytes → 43 base64url characters.
    expect(token).toHaveLength(43);
  });

  it('never repeats', () => {
    const tokens = new Set(Array.from({ length: 20 }, generateCsrfToken));

    expect(tokens.size).toBe(20);
  });
});

describe('createCsrfCookieHeader', () => {
  it('sets an HttpOnly, strict, 24h cookie', () => {
    const header = createCsrfCookieHeader('token-value');

    expect(header).toContain('csrf_token=token-value');
    expect(header).toContain('HttpOnly');
    expect(header).toContain('SameSite=strict');
    expect(header).toContain('Path=/');
    expect(header).toContain('Max-Age=86400');
  });
});

describe('getCsrfTokenFromCookie', () => {
  it('extracts the token from a multi-cookie header', () => {
    const token = getCsrfTokenFromCookie(
      request({ cookie: 'theme=dark; csrf_token=abc123; session=x' })
    );

    expect(token).toBe('abc123');
  });

  it('returns null when the cookie is absent', () => {
    expect(getCsrfTokenFromCookie(request({ cookie: 'theme=dark' }))).toBeNull();
    expect(getCsrfTokenFromCookie(request({}))).toBeNull();
  });
});

describe('validateCsrfToken', () => {
  it('accepts a matching header token', () => {
    expect(validateCsrfToken(request({ 'x-csrf-token': 'abc' }), 'abc')).toBe(true);
  });

  it('rejects a mismatch or a missing header', () => {
    expect(validateCsrfToken(request({ 'x-csrf-token': 'abc' }), 'def')).toBe(false);
    expect(validateCsrfToken(request({}), 'abc')).toBe(false);
  });
});

describe('enforceCsrf', () => {
  it('ignores safe methods', async () => {
    await expect(enforceCsrf(request({}, 'GET'))).resolves.toEqual({ valid: true });
  });

  it('ignores Bearer-authenticated API calls', async () => {
    const result = await enforceCsrf(request({ authorization: 'Bearer id-token' }));

    expect(result.valid).toBe(true);
  });

  it('rejects a state-changing request with no CSRF cookie', async () => {
    const result = await enforceCsrf(request({}));

    expect(result.valid).toBe(false);
    expect(result.response?.status).toBe(403);
    await expect(result.response!.json()).resolves.toEqual({ error: 'CSRF token missing' });
  });

  it('rejects a cookie/header mismatch', async () => {
    const result = await enforceCsrf(
      request({ cookie: 'csrf_token=cookie-value', 'x-csrf-token': 'attacker-value' })
    );

    expect(result.valid).toBe(false);
    expect(result.response?.status).toBe(403);
    await expect(result.response!.json()).resolves.toEqual({ error: 'Invalid CSRF token' });
  });

  it('accepts a matching cookie and header', async () => {
    const result = await enforceCsrf(
      request({ cookie: 'csrf_token=same', 'x-csrf-token': 'same' })
    );

    expect(result).toEqual({ valid: true });
  });
});

describe('issueCsrfToken', () => {
  it('returns a cookie header that carries the issued token', () => {
    const { token, cookieHeader } = issueCsrfToken();

    expect(token).toHaveLength(43);
    expect(cookieHeader).toContain(`csrf_token=${token}`);
  });
});
