/**
 * Tests for the MFA enrolment client wrappers.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({ mfaApi: vi.fn() }));

vi.mock('@/lib/mfaApi', () => ({
  mfaApi: mocks.mfaApi,
  MfaApiError: class extends Error {},
}));

import {
  beginTotpEnrollment,
  confirmSmsCode,
  confirmTotpEnrollment,
  getMfaConfigStatus,
  regenerateBackupCodes,
  sendSmsCode,
} from './mfaSetupClient';

beforeEach(() => {
  mocks.mfaApi.mockReset();
});

describe('getMfaConfigStatus', () => {
  it('parses a complete status payload', async () => {
    mocks.mfaApi.mockResolvedValue({
      totp: { enabled: true, pending: false },
      sms: { enabled: true, phoneNumber: '+919876543210' },
      backupCodes: 7,
      webauthn: {
        enabled: true,
        credentials: [{ id: 'cred-1', name: 'YubiKey', createdAt: 1700 }],
      },
    });

    await expect(getMfaConfigStatus('token')).resolves.toEqual({
      totp: { enabled: true, pending: false },
      sms: { enabled: true, phoneNumber: '+919876543210' },
      backupCodes: 7,
      webauthn: {
        enabled: true,
        credentials: [{ id: 'cred-1', name: 'YubiKey', createdAt: 1700 }],
      },
    });
    expect(mocks.mfaApi).toHaveBeenCalledWith('/api/auth/mfa/status', {
      idToken: 'token',
    });
  });

  it('defaults every missing factor', async () => {
    mocks.mfaApi.mockResolvedValue({});

    await expect(getMfaConfigStatus('token')).resolves.toEqual({
      totp: { enabled: false, pending: false },
      sms: { enabled: false, phoneNumber: null },
      backupCodes: 0,
      webauthn: { enabled: false, credentials: [] },
    });
  });

  it('drops security keys without an id and normalises the rest', async () => {
    mocks.mfaApi.mockResolvedValue({
      webauthn: {
        credentials: [
          { id: 'good' },
          { name: 'no id' },
          null,
          { id: 'also-good', name: 42, createdAt: 'yesterday' },
        ],
      },
    });

    const status = await getMfaConfigStatus('token');

    expect(status.webauthn.credentials).toEqual([
      { id: 'good', name: 'Security key', createdAt: 0 },
      { id: 'also-good', name: 'Security key', createdAt: 0 },
    ]);
  });

  it('ignores a non-array credentials value', async () => {
    mocks.mfaApi.mockResolvedValue({ webauthn: { credentials: 'nope' } });

    const status = await getMfaConfigStatus('token');

    expect(status.webauthn.credentials).toEqual([]);
  });
});

describe('beginTotpEnrollment', () => {
  it('returns the secret, otpauth URI and QR image', async () => {
    mocks.mfaApi.mockResolvedValue({
      secret: 'JBSWY3DPEHPK3PXP',
      qrUrl: 'otpauth://totp/ShipIN?secret=JBSWY3DPEHPK3PXP',
      qrDataUrl: 'data:image/png;base64,abc',
    });

    await expect(beginTotpEnrollment('token')).resolves.toEqual({
      secret: 'JBSWY3DPEHPK3PXP',
      qrUrl: 'otpauth://totp/ShipIN?secret=JBSWY3DPEHPK3PXP',
      qrDataUrl: 'data:image/png;base64,abc',
    });
    expect(mocks.mfaApi).toHaveBeenCalledWith('/api/auth/mfa/totp/setup', {
      idToken: 'token',
      method: 'POST',
    });
  });

  it('falls back to empty strings when the server omits values', async () => {
    mocks.mfaApi.mockResolvedValue({});

    await expect(beginTotpEnrollment('token')).resolves.toEqual({
      secret: '',
      qrUrl: '',
      qrDataUrl: '',
    });
  });
});

describe('backup codes', () => {
  it('returns freshly issued codes on confirm', async () => {
    mocks.mfaApi.mockResolvedValue({ backupCodes: ['a', 'b'] });

    await expect(confirmTotpEnrollment('token', '123456')).resolves.toEqual(['a', 'b']);
    expect(mocks.mfaApi).toHaveBeenCalledWith('/api/auth/mfa/totp/verify', {
      idToken: 'token',
      method: 'POST',
      body: { code: '123456' },
    });
  });

  it('returns an empty list when codes are absent', async () => {
    mocks.mfaApi.mockResolvedValue({});

    await expect(confirmTotpEnrollment('token', '123456')).resolves.toEqual([]);
  });

  it('regenerates codes using a TOTP code', async () => {
    mocks.mfaApi.mockResolvedValue({ backupCodes: ['c'] });

    await expect(regenerateBackupCodes('token', '654321')).resolves.toEqual(['c']);
    expect(mocks.mfaApi).toHaveBeenCalledWith(
      '/api/auth/mfa/backup-codes/regenerate',
      { idToken: 'token', method: 'POST', body: { totpCode: '654321' } }
    );
  });
});

describe('SMS enrolment', () => {
  it('sends a code to a phone number', async () => {
    mocks.mfaApi.mockResolvedValue({ message: 'Sent' });

    await expect(sendSmsCode('token', '+919876543210')).resolves.toBe('Sent');
    expect(mocks.mfaApi).toHaveBeenCalledWith('/api/auth/mfa/sms/setup', {
      idToken: 'token',
      method: 'POST',
      body: { phoneNumber: '+919876543210' },
    });
  });

  it('uses a default message when the body omits one', async () => {
    mocks.mfaApi.mockResolvedValue({});

    await expect(sendSmsCode('token', '+919876543210')).resolves.toBe('Code sent.');
  });

  it('confirms the SMS code', async () => {
    mocks.mfaApi.mockResolvedValue({ message: 'SMS enabled' });

    await expect(confirmSmsCode('token', '123456')).resolves.toBe('SMS enabled');
    expect(mocks.mfaApi).toHaveBeenCalledWith('/api/auth/mfa/sms/verify', {
      idToken: 'token',
      method: 'POST',
      body: { code: '123456' },
    });
  });

  it('uses a default message when confirmation omits one', async () => {
    mocks.mfaApi.mockResolvedValue({});

    await expect(confirmSmsCode('token', '123456')).resolves.toBe('SMS enabled.');
  });
});
