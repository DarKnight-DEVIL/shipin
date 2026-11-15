/**
 * `lib/appCheck.ts` — server-side App Check verification.
 *
 * The important property is the default: nothing is enforced unless the
 * deployment opts in with `APP_CHECK_ENFORCEMENT=true`. A gate that silently
 * switched itself on would break every local run and every CI job that has no
 * Firebase project behind it.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const admin = vi.hoisted(() => ({ verifyToken: vi.fn() }));
// `vitest.setup.ts` mocks '@/config/env' for the whole suite with a static
// object, so this file supplies its own mutable version instead of relying on
// `process.env` (which that global mock never reads).
const env = vi.hoisted(() => ({
  enforcement: undefined as string | undefined,
  siteKey: '' as string,
}));

vi.mock('firebase-admin/app-check', () => ({
  getAppCheck: () => ({ verifyToken: admin.verifyToken }),
}));

vi.mock('@/config/env', () => ({
  get serverEnv() {
    return { APP_CHECK_ENFORCEMENT: env.enforcement };
  },
  get clientEnv() {
    return {
      NODE_ENV: 'test',
      NEXT_PUBLIC_FIREBASE_APP_CHECK_SITE_KEY: env.siteKey,
    };
  },
  isProduction: false,
  isDevelopment: true,
  isTest: true,
}));

// Imported per file, after `vi.resetModules()`: with a shared module registry
// another file can load `./appCheck` before this file's `@/config/env` mock is
// registered, and the module then keeps the global mock's env forever.
let appCheck: typeof import('./appCheck');

function requestWithHeaders(headers: Record<string, string> = {}): Request {
  return new Request('https://shipin.test/api/thing', { headers });
}

beforeEach(async () => {
  vi.resetModules();
  appCheck = await import('./appCheck');
  env.enforcement = undefined;
  env.siteKey = '';
  admin.verifyToken.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('isAppCheckEnforced', () => {
  it('is off by default', () => {
    expect(appCheck.isAppCheckEnforced()).toBe(false);
  });

  it('turns on only for the exact string "true"', () => {
    env.enforcement = 'true';
    expect(appCheck.isAppCheckEnforced()).toBe(true);

    env.enforcement = '1';
    expect(appCheck.isAppCheckEnforced()).toBe(false);
  });
});

describe('verifyAppCheckRequest', () => {
  it('reports not-enforced without looking at the request', async () => {
    await expect(appCheck.verifyAppCheckRequest(requestWithHeaders())).resolves.toBe(
      'not-enforced'
    );
    expect(admin.verifyToken).not.toHaveBeenCalled();
  });

  it('reports a missing token when enforced', async () => {
    env.enforcement = 'true';

    await expect(appCheck.verifyAppCheckRequest(requestWithHeaders())).resolves.toBe(
      'missing'
    );
    expect(admin.verifyToken).not.toHaveBeenCalled();
  });

  it('accepts a token the verifier accepts', async () => {
    env.enforcement = 'true';
    admin.verifyToken.mockResolvedValue({ appId: 'app-1' });

    await expect(
      appCheck.verifyAppCheckRequest(requestWithHeaders({ [appCheck.APP_CHECK_HEADER]: 'good-token' }))
    ).resolves.toBe('ok');
    expect(admin.verifyToken).toHaveBeenCalledWith('good-token');
  });

  it('reads the header case-insensitively', async () => {
    env.enforcement = 'true';
    admin.verifyToken.mockResolvedValue({ appId: 'app-1' });

    await expect(
      appCheck.verifyAppCheckRequest(requestWithHeaders({ 'X-Firebase-AppCheck': 'good-token' }))
    ).resolves.toBe('ok');
  });

  it('reports an invalid token instead of throwing', async () => {
    env.enforcement = 'true';
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    admin.verifyToken.mockRejectedValue(new Error('token expired'));

    await expect(
      appCheck.verifyAppCheckRequest(requestWithHeaders({ [appCheck.APP_CHECK_HEADER]: 'stale-token' }))
    ).resolves.toBe('invalid');
    expect(errorSpy).toHaveBeenCalled();
  });

  it('handles a non-Error rejection without leaking it', async () => {
    env.enforcement = 'true';
    vi.spyOn(console, 'error').mockImplementation(() => {});
    admin.verifyToken.mockRejectedValue('string failure');

    await expect(
      appCheck.verifyAppCheckRequest(requestWithHeaders({ [appCheck.APP_CHECK_HEADER]: 'bad' }))
    ).resolves.toBe('invalid');
  });
});

describe('getAppCheckStatus', () => {
  it('is disabled when neither switch is set', () => {
    expect(appCheck.getAppCheckStatus()).toEqual({
      configured: false,
      enforced: false,
      status: 'disabled',
    });
  });

  it('is configured when only the site key is set', () => {
    env.siteKey = 'site-key';
    expect(appCheck.getAppCheckStatus().status).toBe('configured');
  });

  it('is enforced when both switches are set', () => {
    env.siteKey = 'site-key';
    env.enforcement = 'true';
    expect(appCheck.getAppCheckStatus()).toEqual({
      configured: true,
      enforced: true,
      status: 'enforced',
    });
  });

  it('is misconfigured when enforced without a site key', () => {
    env.enforcement = 'true';
    expect(appCheck.getAppCheckStatus()).toEqual({
      configured: false,
      enforced: true,
      status: 'misconfigured',
    });
  });
});

describe('reportAppCheckStatus', () => {
  it('warns once at startup when enforcement has no site key', () => {
    env.enforcement = 'true';
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const status = appCheck.reportAppCheckStatus();

    expect(status.status).toBe('misconfigured');
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('[AppCheck]'));
    // The warning must name both ways out, or it is just noise in the logs.
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('NEXT_PUBLIC_FIREBASE_APP_CHECK_SITE_KEY')
    );
  });

  it('never throws and stays silent for the other three states', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    // disabled
    expect(appCheck.reportAppCheckStatus().status).toBe('disabled');
    // configured
    env.siteKey = 'site-key';
    expect(appCheck.reportAppCheckStatus().status).toBe('configured');
    // enforced
    env.enforcement = 'true';
    expect(appCheck.reportAppCheckStatus().status).toBe('enforced');

    expect(warnSpy).not.toHaveBeenCalled();
  });
});
