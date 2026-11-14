import { describe, it, expect, vi, beforeEach } from 'vitest';

const env = vi.hoisted(() => ({
  INDIA_POST_TRACKING_URL: '',
  INDIA_POST_CLIENT_ID: '',
  INDIA_POST_CLIENT_SECRET: '',
}));

vi.mock('@/config/env', () => ({ serverEnv: env }));

// Imported per file instead of statically: with a shared module registry the
// first importer fixes which `@/config/env` this module binds to, so a static
// import inherits another suite's real (or differently mocked) env and the
// configuration cases below read empty values.
let getTrackingProvider: typeof import('./index').getTrackingProvider;
let isIndiaPostConfigured: typeof import('./index').isIndiaPostConfigured;

beforeEach(async () => {
  env.INDIA_POST_TRACKING_URL = '';
  env.INDIA_POST_CLIENT_ID = '';
  env.INDIA_POST_CLIENT_SECRET = '';

  vi.resetModules();
  ({ getTrackingProvider, isIndiaPostConfigured } = await import('./index'));
});

describe('getTrackingProvider', () => {
  it('falls back to placeholder when nothing is configured', () => {
    const provider = getTrackingProvider();

    expect(provider.id).toBe('placeholder');
    expect(provider.placeholder).toBe(true);
    expect(isIndiaPostConfigured()).toBe(false);
  });

  it('stays on placeholder with a partial configuration', () => {
    env.INDIA_POST_TRACKING_URL = 'https://cept.example.test/track';

    expect(getTrackingProvider().id).toBe('placeholder');
    expect(isIndiaPostConfigured()).toBe(false);
  });

  it('uses India Post when all three values are present', () => {
    env.INDIA_POST_TRACKING_URL = 'https://cept.example.test/track';
    env.INDIA_POST_CLIENT_ID = 'client';
    env.INDIA_POST_CLIENT_SECRET = 'secret';

    const provider = getTrackingProvider();

    expect(provider.id).toBe('indiapost');
    expect(provider.placeholder).toBe(false);
    expect(isIndiaPostConfigured()).toBe(true);
  });
});
