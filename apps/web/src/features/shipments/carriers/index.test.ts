import { describe, it, expect, vi, beforeEach } from 'vitest';

const env = vi.hoisted(() => ({
  INDIA_POST_TRACKING_URL: '',
  INDIA_POST_CLIENT_ID: '',
  INDIA_POST_CLIENT_SECRET: '',
}));

vi.mock('@/config/env', () => ({ serverEnv: env }));

import { getTrackingProvider, isIndiaPostConfigured } from './index';

beforeEach(() => {
  env.INDIA_POST_TRACKING_URL = '';
  env.INDIA_POST_CLIENT_ID = '';
  env.INDIA_POST_CLIENT_SECRET = '';
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
