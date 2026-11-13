// @vitest-environment happy-dom
/**
 * Tests for the browser-side WebAuthn ceremonies.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  browserSupportsWebAuthn: vi.fn(() => true),
  startRegistration: vi.fn(),
  startAuthentication: vi.fn(),
  mfaApi: vi.fn(),
}));

vi.mock('@simplewebauthn/browser', () => ({
  browserSupportsWebAuthn: mocks.browserSupportsWebAuthn,
  startRegistration: mocks.startRegistration,
  startAuthentication: mocks.startAuthentication,
}));

vi.mock('@/lib/mfaApi', () => ({
  mfaApi: mocks.mfaApi,
  MfaApiError: class MfaApiError extends Error {
    code: string;
    constructor(message: string, code: string) {
      super(message);
      this.name = 'MfaApiError';
      this.code = code;
    }
  },
}));

import {
  WebAuthnCeremonyError,
  assertSecurityKey,
  completeSecurityKeyRegistration,
  isWebAuthnSupported,
  registerSecurityKey,
  removeSecurityKey,
} from './webauthnClient';

const credential = { id: 'cred-1', type: 'public-key' } as never;

beforeEach(() => {
  mocks.browserSupportsWebAuthn.mockReturnValue(true);
  mocks.startRegistration.mockReset();
  mocks.startAuthentication.mockReset();
  mocks.mfaApi.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('isWebAuthnSupported', () => {
  it('reflects browser support', () => {
    expect(isWebAuthnSupported()).toBe(true);

    mocks.browserSupportsWebAuthn.mockReturnValue(false);
    expect(isWebAuthnSupported()).toBe(false);
  });

  it('is false when there is no window', () => {
    vi.stubGlobal('window', undefined);

    expect(isWebAuthnSupported()).toBe(false);
  });
});

describe('registerSecurityKey', () => {
  it('runs the registration ceremony with server options', async () => {
    const options = { challenge: 'abc' };
    mocks.mfaApi.mockResolvedValue({ success: true, options });
    mocks.startRegistration.mockResolvedValue(credential);

    await expect(registerSecurityKey('token', 'YubiKey')).resolves.toBe(credential);
    expect(mocks.startRegistration).toHaveBeenCalledWith({ optionsJSON: options });
  });

  it('fails when the server omits registration options', async () => {
    mocks.mfaApi.mockResolvedValue({ success: false });

    await expect(registerSecurityKey('token', 'YubiKey')).rejects.toMatchObject({
      name: 'MfaApiError',
      code: 'UNKNOWN_ERROR',
    });
    expect(mocks.startRegistration).not.toHaveBeenCalled();
  });

  it.each([
    ['NotAllowedError', 'Security key prompt was cancelled.', true],
    ['AbortError', 'Security key prompt was cancelled.', true],
    ['InvalidStateError', 'This security key is already registered.', false],
    ['UnknownError', 'This security key could not be used. Try again.', false],
  ])('maps %s from the ceremony', async (name, message, cancelled) => {
    mocks.mfaApi.mockResolvedValue({ options: { challenge: 'abc' } });
    mocks.startRegistration.mockRejectedValue(Object.assign(new Error('x'), { name }));

    await expect(registerSecurityKey('token', 'YubiKey')).rejects.toMatchObject({
      name: 'WebAuthnCeremonyError',
      message,
      cancelled,
    });
  });
});

describe('completeSecurityKeyRegistration', () => {
  it('returns the stored credential', async () => {
    mocks.mfaApi.mockResolvedValue({ credential: { id: 'cred-1', name: 'YubiKey' } });

    await expect(
      completeSecurityKeyRegistration('token', credential, 'YubiKey')
    ).resolves.toEqual({ id: 'cred-1', name: 'YubiKey' });
    expect(mocks.mfaApi).toHaveBeenCalledWith(
      '/api/auth/mfa/webauthn/register/complete',
      {
        idToken: 'token',
        method: 'POST',
        body: { credential, credentialName: 'YubiKey' },
      }
    );
  });

  it('falls back to an empty id and the requested name', async () => {
    mocks.mfaApi.mockResolvedValue({});

    await expect(
      completeSecurityKeyRegistration('token', credential, 'Backup key')
    ).resolves.toEqual({ id: '', name: 'Backup key' });
  });
});

describe('assertSecurityKey', () => {
  it('runs the assertion ceremony', async () => {
    const options = { challenge: 'verify' };
    mocks.mfaApi.mockResolvedValue({ options });
    mocks.startAuthentication.mockResolvedValue(credential);

    await expect(assertSecurityKey('token')).resolves.toBe(credential);
    expect(mocks.mfaApi).toHaveBeenCalledWith('/api/auth/mfa/webauthn/verify', {
      idToken: 'token',
      method: 'POST',
    });
  });

  it('fails when verification options are missing', async () => {
    mocks.mfaApi.mockResolvedValue({});

    await expect(assertSecurityKey('token')).rejects.toMatchObject({
      code: 'UNKNOWN_ERROR',
    });
  });

  it('marks a cancelled assertion as cancelled', async () => {
    mocks.mfaApi.mockResolvedValue({ options: { challenge: 'verify' } });
    mocks.startAuthentication.mockRejectedValue(
      Object.assign(new Error('cancelled'), { name: 'NotAllowedError' })
    );

    const error = await assertSecurityKey('token').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(WebAuthnCeremonyError);
    expect(error).toMatchObject({ cancelled: true });
  });
});

describe('removeSecurityKey', () => {
  it('returns the remaining key count', async () => {
    mocks.mfaApi.mockResolvedValue({ remaining: 2 });

    await expect(removeSecurityKey('token', 'cred-1')).resolves.toBe(2);
    expect(mocks.mfaApi).toHaveBeenCalledWith(
      '/api/auth/mfa/webauthn/credentials',
      { idToken: 'token', method: 'DELETE', body: { id: 'cred-1' } }
    );
  });

  it('defaults to zero when the count is missing', async () => {
    mocks.mfaApi.mockResolvedValue({});

    await expect(removeSecurityKey('token', 'cred-1')).resolves.toBe(0);
  });
});
