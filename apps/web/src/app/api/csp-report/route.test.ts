import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// These suites rebuild their module graph per test (they reset modules so each
// case gets a fresh instance). That is cheap normally but can exceed the
// default 5s ceiling when the whole suite runs unisolated on a loaded machine,
// which surfaced as spurious timeouts. The assertions are unchanged.
vi.setConfig({ testTimeout: 15_000 });
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({ captureMessage: vi.fn() }));

vi.mock('@sentry/nextjs', () => ({ captureMessage: mocks.captureMessage }));

import { POST } from './route';

function reportRequest(body: unknown) {
  return new NextRequest('http://localhost/api/csp-report', {
    method: 'POST',
    body: typeof body === 'string' ? body : JSON.stringify(body),
    headers: { 'Content-Type': 'application/csp-report' },
  });
}

beforeEach(() => {
  mocks.captureMessage.mockReset();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('POST /api/csp-report', () => {
  it('rejects an unreadable body', async () => {
    const response = await POST(reportRequest('{not json'));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: 'Invalid JSON body.',
    });
  });

  it('logs the violated directive and blocked uri', async () => {
    const response = await POST(
      reportRequest({
        'csp-report': {
          'violated-directive': 'script-src-elem',
          'blocked-uri': 'https://evil.example/x.js',
        },
      })
    );

    expect(console.warn).toHaveBeenCalledWith('[CSP Report]', {
      violatedDirective: 'script-src-elem',
      blockedUri: 'https://evil.example/x.js',
    });
    await expect(response.json()).resolves.toEqual({ received: true });
  });

  it('accepts a report with an unexpected shape', async () => {
    const response = await POST(reportRequest({ 'csp-report': 'not-an-object' }));

    expect(response.status).toBe(200);
    expect(console.warn).toHaveBeenCalledWith('[CSP Report]', {
      violatedDirective: undefined,
      blockedUri: undefined,
    });
  });

  it('still acknowledges the report when forwarding is configured', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', 'https://dsn.example/1');

    /* Forwarding is best-effort: the endpoint must answer either way. */
    const response = await POST(
      reportRequest({ 'csp-report': { 'violated-directive': 'img-src' } })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ received: true });
  });

  it('does not forward outside production', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', 'https://dsn.example/1');

    await POST(reportRequest({ 'csp-report': {} }));

    expect(mocks.captureMessage).not.toHaveBeenCalled();
  });

  it('survives a Sentry transport failure', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', 'https://dsn.example/1');
    mocks.captureMessage.mockImplementation(() => {
      throw new Error('transport down');
    });

    const response = await POST(reportRequest({ 'csp-report': {} }));

    expect(response.status).toBe(200);
  });
});
