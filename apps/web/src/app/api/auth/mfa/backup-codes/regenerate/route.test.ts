import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const mocks = vi.hoisted(() => ({
  requireAuthWithProfile: vi.fn(),
  get: vi.fn(),
  update: vi.fn(),
  generateBackupCodes: vi.fn(),
  hashBackupCode: vi.fn((code: string) => `hash:${code}`),
  verifyTotp: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({ requireAuthWithProfile: mocks.requireAuthWithProfile }));
vi.mock('@/lib/firebaseAdmin', () => ({
  adminDb: {
    collection: vi.fn(() => ({ doc: vi.fn(() => ({ get: mocks.get, update: mocks.update })) })),
  },
}));
vi.mock('@/lib/mfa', () => ({
  generateBackupCodes: mocks.generateBackupCodes,
  hashBackupCode: mocks.hashBackupCode,
  verifyTotp: mocks.verifyTotp,
}));
vi.mock('firebase-admin/firestore', () => ({
  FieldValue: { serverTimestamp: () => '__SERVER_TS__' },
}));

import { POST } from './route';

const request = (body: unknown = { totpCode: '123456' }) =>
  new NextRequest('http://localhost/api/auth/mfa/backup-codes/regenerate', {
    method: 'POST',
    body: JSON.stringify(body),
  });

beforeEach(() => {
  mocks.requireAuthWithProfile
    .mockReset()
    .mockResolvedValue({ profile: { uid: 'admin-1', role: 'admin' } });
  mocks.get.mockReset().mockResolvedValue({
    exists: true,
    data: () => ({ mfa: { totp: { enabled: true, secret: 'SECRET' } } }),
  });
  mocks.update.mockReset().mockResolvedValue(undefined);
  mocks.generateBackupCodes.mockReset().mockReturnValue(['CODE-1', 'CODE-2']);
  mocks.verifyTotp.mockReset().mockReturnValue(true);
});

describe('POST /api/auth/mfa/backup-codes/regenerate', () => {
  it('rejects unauthenticated callers', async () => {
    mocks.requireAuthWithProfile.mockResolvedValue(
      NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    );

    const response = await POST(request());

    expect(response.status).toBe(401);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('requires an administrator', async () => {
    mocks.requireAuthWithProfile.mockResolvedValue({
      profile: { uid: 'user-1', role: 'customer' },
    });

    const response = await POST(request());

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ code: 'ADMIN_ACCESS_REQUIRED' });
  });

  it('requires a six digit code', async () => {
    const response = await POST(request({ totpCode: '123' }));

    expect(response.status).toBe(400);
    expect(mocks.get).not.toHaveBeenCalled();
  });

  it('404s when the admin profile is missing', async () => {
    mocks.get.mockResolvedValue({ exists: false });

    const response = await POST(request());

    expect(response.status).toBe(404);
  });

  it('refuses when TOTP is not enabled', async () => {
    mocks.get.mockResolvedValue({ exists: true, data: () => ({ mfa: { totp: {} } }) });

    const response = await POST(request());

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ code: 'TOTP_NOT_SETUP' });
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('rejects a wrong TOTP code', async () => {
    mocks.verifyTotp.mockReturnValue(false);

    const response = await POST(request());

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ code: 'INVALID_TOTP_CODE' });
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('generates ten fresh hashed codes', async () => {
    const response = await POST(request());

    expect(mocks.generateBackupCodes).toHaveBeenCalledWith(10);
    expect(mocks.verifyTotp).toHaveBeenCalledWith('SECRET', '123456', 1);
    expect(mocks.update).toHaveBeenCalledWith({
      'mfa.totp.backupCodes': ['hash:CODE-1', 'hash:CODE-2'],
      updatedAt: '__SERVER_TS__',
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      backupCodes: ['CODE-1', 'CODE-2'],
    });
  });
});
