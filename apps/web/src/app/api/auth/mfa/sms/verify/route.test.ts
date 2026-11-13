import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const mocks = vi.hoisted(() => ({
  requireAuthWithProfile: vi.fn(),
  get: vi.fn(),
  update: vi.fn(),
  hashSmsCode: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({ requireAuthWithProfile: mocks.requireAuthWithProfile }));
vi.mock('@/lib/firebaseAdmin', () => ({
  adminDb: {
    collection: vi.fn(() => ({ doc: vi.fn(() => ({ get: mocks.get, update: mocks.update })) })),
  },
}));
vi.mock('firebase-admin/firestore', () => ({
  FieldValue: {
    serverTimestamp: () => '__SERVER_TS__',
    delete: () => '__DELETE__',
  },
}));
vi.mock('@/lib/mfa', () => ({ hashSmsCode: mocks.hashSmsCode }));

import { POST } from './route';

const request = (body: unknown = { code: '123456' }) =>
  new NextRequest('http://localhost/api/auth/mfa/sms/verify', {
    method: 'POST',
    body: JSON.stringify(body),
  });

const pending = (overrides: Record<string, unknown> = {}) => ({
  exists: true,
  data: () => ({
    mfa: {
      sms: {
        pendingCode: 'hashed-123456',
        pendingPhoneNumber: '+441234567890',
        pendingExpires: Date.now() + 60_000,
        ...overrides,
      },
    },
  }),
});

beforeEach(() => {
  mocks.requireAuthWithProfile
    .mockReset()
    .mockResolvedValue({ profile: { uid: 'admin-1', role: 'admin' } });
  mocks.get.mockReset().mockResolvedValue(pending());
  mocks.update.mockReset().mockResolvedValue(undefined);
  mocks.hashSmsCode.mockReset().mockReturnValue('hashed-123456');
});

describe('POST /api/auth/mfa/sms/verify', () => {
  it('rejects unauthenticated callers', async () => {
    mocks.requireAuthWithProfile.mockResolvedValue(
      NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    );

    const response = await POST(request());

    expect(response.status).toBe(401);
    expect(mocks.get).not.toHaveBeenCalled();
  });

  it('requires an administrator', async () => {
    mocks.requireAuthWithProfile.mockResolvedValue({
      profile: { uid: 'user-1', role: 'customer' },
    });

    const response = await POST(request());

    expect(response.status).toBe(403);
  });

  it.each(['', '12345', '1234567'])('rejects the code format %j', async (code) => {
    const response = await POST(request({ code }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      code: 'INVALID_VERIFICATION_CODE',
    });
  });

  it('404s when the profile is missing', async () => {
    mocks.get.mockResolvedValue({ exists: false });

    const response = await POST(request());

    expect(response.status).toBe(404);
  });

  it('requires a pending verification', async () => {
    mocks.get.mockResolvedValue({ exists: true, data: () => ({ mfa: { sms: {} } }) });

    const response = await POST(request());

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      code: 'SMS_VERIFICATION_NOT_PENDING',
    });
  });

  it('rejects an expired code', async () => {
    mocks.get.mockResolvedValue(pending({ pendingExpires: Date.now() - 1 }));

    const response = await POST(request());

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ code: 'SMS_CODE_EXPIRED' });
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('rejects a mismatched code', async () => {
    mocks.hashSmsCode.mockReturnValue('hashed-999999');

    const response = await POST(request());

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      code: 'INVALID_VERIFICATION_CODE',
    });
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('enables SMS MFA and clears the pending state', async () => {
    const response = await POST(request());

    expect(mocks.hashSmsCode).toHaveBeenCalledWith('123456');
    expect(mocks.update).toHaveBeenCalledWith({
      'mfa.sms.enabled': true,
      'mfa.sms.phoneNumber': '+441234567890',
      'mfa.sms.pendingCode': '__DELETE__',
      'mfa.sms.pendingPhoneNumber': '__DELETE__',
      'mfa.sms.pendingExpires': '__DELETE__',
      'mfa.required': true,
      updatedAt: '__SERVER_TS__',
    });
    await expect(response.json()).resolves.toMatchObject({ success: true });
  });
});
