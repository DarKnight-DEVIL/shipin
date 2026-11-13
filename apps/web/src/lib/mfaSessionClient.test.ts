/**
 * Tests for the client-side admin MFA session helpers.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mocks = vi.hoisted(() => ({ mfaApi: vi.fn() }));

vi.mock('@/lib/mfaApi', () => ({ mfaApi: mocks.mfaApi }));

import {
  endMfaSession,
  getMfaSessionStatus,
  startMfaSession,
  startWebAuthnSession,
} from './mfaSessionClient';

const fetchMock = vi.fn();

beforeEach(() => {
  mocks.mfaApi.mockReset();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('getMfaSessionStatus', () => {
  it('reads a fully populated session', async () => {
    mocks.mfaApi.mockResolvedValue({
      elevated: true,
      expiresAt: 1_700_000_000_000,
      methods: [{ id: 'totp' }],
      sessionTtlMs: 900_000,
    });

    await expect(getMfaSessionStatus('token')).resolves.toEqual({
      elevated: true,
      expiresAt: 1_700_000_000_000,
      methods: [{ id: 'totp' }],
      sessionTtlMs: 900_000,
    });
    expect(mocks.mfaApi).toHaveBeenCalledWith('/api/auth/mfa/session', {
      idToken: 'token',
    });
  });

  it('normalises a malformed response to safe defaults', async () => {
    mocks.mfaApi.mockResolvedValue({
      elevated: 0,
      expiresAt: 'soon',
      methods: 'totp',
      sessionTtlMs: null,
    });

    await expect(getMfaSessionStatus('token')).resolves.toEqual({
      elevated: false,
      expiresAt: null,
      methods: [],
      sessionTtlMs: 0,
    });
  });
});

describe('startMfaSession', () => {
  it('exchanges a code for an elevated session', async () => {
    mocks.mfaApi.mockResolvedValue({ expiresAt: 123, method: 'totp' });

    await expect(startMfaSession('token', 'totp', '123456')).resolves.toEqual({
      expiresAt: 123,
      method: 'totp',
    });
    expect(mocks.mfaApi).toHaveBeenCalledWith('/api/auth/mfa/session', {
      idToken: 'token',
      method: 'POST',
      body: { method: 'totp', code: '123456' },
    });
  });

  it('falls back to the requested method and a null expiry', async () => {
    mocks.mfaApi.mockResolvedValue({});

    await expect(startMfaSession('token', 'sms', '999999')).resolves.toEqual({
      expiresAt: null,
      method: 'sms',
    });
  });
});

describe('startWebAuthnSession', () => {
  it('posts the assertion as a webauthn session', async () => {
    mocks.mfaApi.mockResolvedValue({ expiresAt: 456 });

    await expect(
      startWebAuthnSession('token', { id: 'credential-1' })
    ).resolves.toEqual({ expiresAt: 456, method: 'webauthn' });

    expect(mocks.mfaApi).toHaveBeenCalledWith('/api/auth/mfa/session', {
      idToken: 'token',
      method: 'POST',
      body: { method: 'webauthn', credential: { id: 'credential-1' } },
    });
  });
});

describe('endMfaSession', () => {
  it('deletes the session cookie without caching', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));

    await endMfaSession();

    expect(fetchMock).toHaveBeenCalledWith('/api/auth/mfa/session', {
      method: 'DELETE',
      credentials: 'same-origin',
      cache: 'no-store',
    });
  });

  it('swallows network failures so sign-out is never blocked', async () => {
    fetchMock.mockRejectedValue(new TypeError('offline'));

    await expect(endMfaSession()).resolves.toBeUndefined();
  });
});
