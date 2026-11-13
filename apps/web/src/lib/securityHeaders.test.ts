/**
 * Unit tests for security headers configuration.
 */

import { describe, it, expect, vi } from 'vitest';

import {
  getDevCSP,
  SECURITY_HEADERS,
  getRobotsTag,
  sanitizeCsp,
  createSecureCookieHeader,
} from './securityHeaders';

/**
 * `isDevelopment` / `isProduction` are captured when the module is first
 * evaluated, so each branch needs a freshly imported module with a stubbed
 * `@/config/env`.
 */
async function importWithEnv(env: { isDevelopment: boolean; isProduction: boolean }) {
  vi.resetModules();
  vi.doMock('@/config/env', () => env);
  try {
    return await import('./securityHeaders');
  } finally {
    vi.doUnmock('@/config/env');
  }
}

/** Returns a single directive (e.g. `script-src`) from a CSP header value. */
function cspDirective(csp: string, name: string): string {
  const match = csp
    .split(';')
    .map((part) => part.trim())
    .find((part) => part === name || part.startsWith(`${name} `));

  return match ?? '';
}

describe('SECURITY_HEADERS', () => {
  it('pins the hardening defaults', () => {
    expect(SECURITY_HEADERS['Referrer-Policy']).toBe('strict-origin-when-cross-origin');
    expect(SECURITY_HEADERS['X-Frame-Options']).toBe('DENY');
    expect(SECURITY_HEADERS['Strict-Transport-Security']).toBe(
      'max-age=31536000; includeSubDomains; preload'
    );
    expect(SECURITY_HEADERS['X-Content-Type-Options']).toBe('nosniff');
    expect(SECURITY_HEADERS['X-XSS-Protection']).toBe('0');
    expect(SECURITY_HEADERS['Cross-Origin-Resource-Policy']).toBe('same-origin');
    expect(SECURITY_HEADERS['X-Robots-Tag']).toBe('noindex, nofollow');
  });

  it('locks down powerful browser features', () => {
    const policy = SECURITY_HEADERS['Permissions-Policy'];

    expect(policy).toContain('camera=()');
    expect(policy).toContain('microphone=()');
    expect(policy).toContain('payment=(self)');
  });

  it('declares the CSP reporting endpoint', () => {
    expect(SECURITY_HEADERS['Reporting-Endpoints']).toContain('/api/csp-report');
    expect(SECURITY_HEADERS['Content-Security-Policy']).toContain(
      "report-to 'csp-endpoint'"
    );
  });
});

describe('getRobotsTag', () => {
  it('allows indexing for public pages', () => {
    expect(getRobotsTag(true)).toBe('index, follow');
  });

  it('blocks indexing for app pages by default', () => {
    expect(getRobotsTag()).toBe('noindex, nofollow');
    expect(getRobotsTag(false)).toBe('noindex, nofollow');
  });
});

describe('getDevCSP', () => {
  it('allows inline/eval for the dev server bundle', () => {
    const csp = getDevCSP();

    expect(csp).toContain("script-src");
    expect(csp).toContain('unsafe-inline');
    expect(csp).toContain('unsafe-eval');
  });

  it('still forbids framing and plugins', () => {
    const csp = getDevCSP();

    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain('report-uri /api/csp-report');
  });
});

describe('getProductionCSP', () => {
  it('allows the inline hydration scripts that prerendered pages ship', async () => {
    const { getProductionCSP: prodCsp } = await importWithEnv({
      isDevelopment: false,
      isProduction: true,
    });

    const scriptSrc = cspDirective(prodCsp(), 'script-src');

    // Next writes its bootstrap inline at build time, before any request
    // exists, so a nonce can never match it.
    expect(scriptSrc).toContain("'unsafe-inline'");
    expect(scriptSrc).toContain("'self'");
    expect(scriptSrc).not.toContain('nonce-');
    expect(scriptSrc).not.toContain('strict-dynamic');
  });

  it('keeps unsafe-eval out of the production script-src', async () => {
    const { getProductionCSP: prodCsp } = await importWithEnv({
      isDevelopment: false,
      isProduction: true,
    });

    expect(cspDirective(prodCsp(), 'script-src')).not.toContain('unsafe-eval');
  });

  it('keeps the non-nonce lockdown directives', async () => {
    const { getProductionCSP: prodCsp } = await importWithEnv({
      isDevelopment: false,
      isProduction: true,
    });

    const csp = prodCsp();

    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("form-action 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("report-to 'csp-endpoint'");
    expect(csp).toContain('upgrade-insecure-requests');
  });

  it('still allows inline styles in production for styled components', async () => {
    const { getProductionCSP: prodCsp } = await importWithEnv({
      isDevelopment: false,
      isProduction: true,
    });

    expect(cspDirective(prodCsp(), 'style-src')).toContain('unsafe-inline');
  });

  it('allowlists the third-party script hosts the app loads', async () => {
    const { getProductionCSP: prodCsp } = await importWithEnv({
      isDevelopment: false,
      isProduction: true,
    });

    const scriptSrc = cspDirective(prodCsp(), 'script-src');

    expect(scriptSrc).toContain('https://js.paypal.com');
    expect(scriptSrc).toContain('https://apis.google.com');
  });
});

describe('sanitizeCsp', () => {
  it('strips characters that could break out of the header', () => {
    expect(sanitizeCsp('a;b"c`d\\e')).toBe('abcde');
  });

  it('removes directive separators and quotes from a real policy', () => {
    const sanitized = sanitizeCsp("default-src 'self'; script-src 'self';");

    expect(sanitized).not.toContain(';');
    expect(sanitized).toBe("default-src 'self' script-src 'self'");
  });

  it('leaves a policy without dangerous characters untouched', () => {
    const policy = "default-src 'self'";

    expect(sanitizeCsp(policy)).toBe(policy);
  });
});

describe('getSecureCookieOptions', () => {
  it('hardens the cookie in production', async () => {
    const { getSecureCookieOptions: prodOptions } = await importWithEnv({
      isDevelopment: false,
      isProduction: true,
    });

    expect(prodOptions()).toEqual({
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      path: '/',
      maxAge: 3600,
    });
  });

  it('drops Secure in development so http://localhost works', async () => {
    const { getSecureCookieOptions: devOptions } = await importWithEnv({
      isDevelopment: true,
      isProduction: false,
    });

    expect(devOptions().secure).toBe(false);
    expect(devOptions().httpOnly).toBe(true);
  });
});

describe('createSecureCookieHeader', () => {
  it('serialises a hardened cookie', () => {
    const header = createSecureCookieHeader('test', 'value', {
      secure: true,
      maxAge: 100,
    });

    expect(header).toContain('test=value');
    expect(header).toContain('Path=/');
    expect(header).toContain('HttpOnly');
    expect(header).toContain('SameSite=strict');
    expect(header).toContain('Max-Age=100');
    expect(header).toContain('Secure');
  });

  it('omits Secure when explicitly disabled', () => {
    const header = createSecureCookieHeader('test', 'value', { secure: false });

    expect(header).not.toContain('Secure');
  });

  it('omits every optional attribute when they are disabled', () => {
    const header = createSecureCookieHeader('test', 'value', {
      path: '',
      secure: false,
      httpOnly: false,
      sameSite: undefined,
      maxAge: 0,
    });

    expect(header).toBe('test=value');
  });
});
