import { describe, it, expect, afterEach } from 'vitest';
import { isAllowedOrigin, getCorsHeaders, getServerSideCorsHeaders } from './cors';

const originalEnv = process.env.APP_ALLOWED_ORIGINS;

afterEach(() => {
  if (originalEnv === undefined) {
    delete process.env.APP_ALLOWED_ORIGINS;
  } else {
    process.env.APP_ALLOWED_ORIGINS = originalEnv;
  }
});

describe('isAllowedOrigin', () => {
  it('allows the Vercel deployment', () => {
    expect(isAllowedOrigin('https://shipin-psi.vercel.app')).toBe(true);
  });

  it('allows both Firebase Hosting domains', () => {
    expect(isAllowedOrigin('https://shipin-9576a.web.app')).toBe(true);
    expect(isAllowedOrigin('https://shipin-9576a.firebaseapp.com')).toBe(true);
  });

  it('allows local development on both loopback hosts', () => {
    expect(isAllowedOrigin('http://localhost:3000')).toBe(true);
    expect(isAllowedOrigin('http://127.0.0.1:3000')).toBe(true);
  });

  it('normalizes case and a trailing slash', () => {
    expect(isAllowedOrigin('HTTPS://Shipin-9576a.web.app/')).toBe(true);
  });

  it('rejects unknown origins', () => {
    expect(isAllowedOrigin('https://evil.example.com')).toBe(false);
  });

  it('rejects a lookalike host that only ends with an allowed name', () => {
    expect(isAllowedOrigin('https://shipin-9576a.web.app.evil.com')).toBe(false);
    expect(isAllowedOrigin('https://evil-shipin-9576a.web.app')).toBe(false);
  });

  it('rejects a missing origin', () => {
    expect(isAllowedOrigin(null)).toBe(false);
  });

  it('accepts origins added through APP_ALLOWED_ORIGINS', () => {
    process.env.APP_ALLOWED_ORIGINS =
      'https://shipin.example.com, https://staging.example.com/';

    expect(isAllowedOrigin('https://shipin.example.com')).toBe(true);
    expect(isAllowedOrigin('https://staging.example.com')).toBe(true);
    expect(isAllowedOrigin('https://other.example.com')).toBe(false);
  });
});

describe('getCorsHeaders', () => {
  it('echoes an allowed origin and permits credentials', () => {
    const headers = getCorsHeaders('https://shipin-9576a.web.app');

    expect(headers['Access-Control-Allow-Origin']).toBe(
      'https://shipin-9576a.web.app'
    );
    expect(headers['Access-Control-Allow-Credentials']).toBe('true');
    expect(headers['Vary']).toBe('Origin');
  });

  it('omits the allow-origin header for an unknown origin', () => {
    const headers = getCorsHeaders('https://evil.example.com');

    expect(headers['Access-Control-Allow-Origin']).toBeUndefined();
  });

  it('returns standard headers even for disallowed origin', () => {
    const headers = getCorsHeaders('https://evil.example.com');
    expect(headers['Access-Control-Allow-Methods']).toBe('GET, POST, PUT, DELETE, OPTIONS');
    expect(headers['Access-Control-Allow-Headers']).toContain('Authorization');
    expect(headers['Access-Control-Max-Age']).toBe('86400');
    expect(headers['Vary']).toBe('Origin');
  });

  it('handles null origin gracefully', () => {
    const headers = getCorsHeaders(null);
    expect(headers['Access-Control-Allow-Origin']).toBeUndefined();
    expect(headers['Access-Control-Allow-Credentials']).toBeUndefined();
  });
});

describe('getServerSideCorsHeaders', () => {
  it('includes CORS headers plus security headers', () => {
    const headers = getServerSideCorsHeaders('https://shipin-psi.vercel.app');
    expect(headers['Access-Control-Allow-Origin']).toBe('https://shipin-psi.vercel.app');
    expect(headers['Referrer-Policy']).toBe('strict-origin-when-cross-origin');
    expect(headers['X-Frame-Options']).toBe('DENY');
    expect(headers['X-Content-Type-Options']).toBe('nosniff');
    expect(headers['Permissions-Policy']).toContain('camera=()');
    expect(headers['Permissions-Policy']).toContain('payment=(self)');
  });

  it('works without origin', () => {
    const headers = getServerSideCorsHeaders(null);
    expect(headers['Access-Control-Allow-Origin']).toBeUndefined();
    expect(headers['X-Frame-Options']).toBe('DENY');
  });
});