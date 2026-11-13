import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const mocks = vi.hoisted(() => ({
  requireAuthWithProfile: vi.fn(),
  get: vi.fn(),
  refUpdate: vi.fn(),
  generateBackupCodes: vi.fn(),
  hashBackupCode: vi.fn((code: string) => `hash:${code}`),
  verifyTotp: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({ requireAuthWithProfile: mocks.requireAuthWithProfile }));
vi.mock('@/lib/firebaseAdmin', () => ({
  adminDb: {
    collection: vi.fn(() => ({
      doc: vi.fn(() => ({ get: mocks.get, update: vi.fn() })),
    })),
  },
}));
vi.mock('firebase-admin/firestore', () => ({
  FieldValue: { serverTimestamp: () => '__SERVER_TS__' },
}));
vi.mock('@/lib/mfa', () => ({
  generateBackupCodes: mocks.generateBackupCodes,
  hashBackupCode: mocks.hashBackupCode,
  verifyTotp: mocks.verifyTotp,
}));

import { POST } from './route';

const request = (body: unknown = { code: '123456' }) =>
  new NextRequest('http://localhost/api/auth/mfa/totp/verify', {
    method: 'POST',
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

const profile = (totp: Record<string, unknown> = { secret: 'SECRET' }) => ({
  exists: true,
  data: () => ({ mfa: { totp } }),
  ref: { update: mocks.refUpdate },
});

beforeEach(() => {
  mocks.requireAuthWithProfile
    .mockReset()
    .mockResolvedValue({ profile: { uid: 'admin-1', role: 'admin' } });
  mocks.get.mockReset().mockResolvedValue(profile());
  mocks.refUpdate.mockReset().mockResolvedValue(undefined);
  mocks.generateBackupCodes.mockReset().mockReturnValue(['CODE-1', 'CODE-2']);
  mocks.verifyTotp.mockReset().mockReturnValue(true);
});

describe('POST /api/auth/mfa/totp/verify', () => {
  it('rejects unauthenticated callers', async () => {
    mocks.requireAuthWithProfile.mockResolvedValue(
      NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    );

    const response = await POST(request());

    expect(response.status).toBe(401);
    expect(mocks.verifyTotp).not.toHaveBeenCalled();
  });

  it('requires an administrator', async () => {
    mocks.requireAuthWithProfile.mockResolvedValue({
      profile: { uid: 'user-1', role: 'customer' },
    });

    const response = await POST(request());

    expect(response.status).toBe(403);
  });

  it('rejects an unreadable body', async () => {
    const response = await POST(request('{broken'));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ code: 'INVALID_REQUEST_BODY' });
  });

  it.each(['', '12345', 'abcdef', '1234567'])('rejects the code %j', async (code) => {
    const response = await POST(request({ code }));

    expect(response.status).toBe(400);
    expect(mocks.get).not.toHaveBeenCalled();
  });

  it('404s when the profile is missing', async () => {
    mocks.get.mockResolvedValue({ exists: false });

    const response = await POST(request());

    expect(response.status).toBe(404);
  });

  it('requires that enrollment was started', async () => {
    mocks.get.mockResolvedValue(profile({}));

    const response = await POST(request());

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ code: 'TOTP_NOT_SETUP' });
  });

  it('rejects a wrong code', async () => {
    mocks.verifyTotp.mockReturnValue(false);

    const response = await POST(request());

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ code: 'INVALID_TOTP_CODE' });
    expect(mocks.refUpdate).not.toHaveBeenCalled();
  });

  it('enables TOTP and issues fresh backup codes', async () => {
    const response = await POST(request({ code: ' 123 456 ' }));

    expect(mocks.verifyTotp).toHaveBeenCalledWith('SECRET', '123456', 1);
    expect(mocks.generateBackupCodes).toHaveBeenCalledWith(10);
    expect(mocks.refUpdate).toHaveBeenCalledWith({
      'mfa.totp.enabled': true,
      'mfa.totp.backupCodes': ['hash:CODE-1', 'hash:CODE-2'],
      'mfa.preferredMethod': 'totp',
      updatedAt: '__SERVER_TS__',
    });
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      backupCodes: ['CODE-1', 'CODE-2'],
    });
  });
});
