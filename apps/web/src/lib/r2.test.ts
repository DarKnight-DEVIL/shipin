/**
 * Tests for the Cloudflare R2 client factory.
 *
 * `@aws-sdk/client-s3` is mocked so no client (or network) is constructed;
 * the assertions are about the configuration the factory passes in.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  S3Client: vi.fn(function (this: unknown, config: unknown) {
    return { config };
  }),
  serverEnv: {
    R2_ACCOUNT_ID: 'account-123',
    R2_ACCESS_KEY_ID: 'access-key',
    R2_SECRET_ACCESS_KEY: 'secret-key',
    R2_BUCKET_NAME: 'shipin-bucket',
  },
}));

vi.mock('@aws-sdk/client-s3', () => ({ S3Client: mocks.S3Client }));
vi.mock('@/config/env', () => ({ serverEnv: mocks.serverEnv }));

// Imported per test: the module caches the client, so each test needs a fresh
// instance after `vi.resetModules()`.
async function loadModule() {
  return import('./r2');
}

beforeEach(() => {
  vi.resetModules();
  mocks.S3Client.mockClear();
});

describe('getR2BucketName', () => {
  it('returns the configured bucket', async () => {
    const { getR2BucketName } = await loadModule();

    expect(getR2BucketName()).toBe('shipin-bucket');
  });
});

describe('getR2Client', () => {
  it('builds an S3 client pointed at the account R2 endpoint', async () => {
    const { getR2Client } = await loadModule();

    getR2Client();

    expect(mocks.S3Client).toHaveBeenCalledWith({
      region: 'auto',
      endpoint: 'https://account-123.r2.cloudflarestorage.com',
      credentials: {
        accessKeyId: 'access-key',
        secretAccessKey: 'secret-key',
      },
    });
  });

  it('caches the client across calls', async () => {
    const { getR2Client } = await loadModule();

    const first = getR2Client();
    const second = getR2Client();

    expect(second).toBe(first);
    expect(mocks.S3Client).toHaveBeenCalledTimes(1);
  });
});
