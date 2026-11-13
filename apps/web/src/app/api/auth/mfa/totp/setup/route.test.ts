import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const mocks = vi.hoisted(() => ({
  requireAuthWithProfile: vi.fn(),
  get: vi.fn(),
  refUpdate: vi.fn(),
  generateTotpSecret: vi.fn(),
  getTotpQrUrl: vi.fn(),
  renderTotpQrDataUrl: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({ requireAuthWithProfile: mocks.requireAuthWithProfile }));
vi.mock('@/lib/firebaseAdmin', () => ({
  adminDb: {
    collection: vi.fn(() => ({
      doc: vi.fn(() => ({
        get: mocks.get,
        update: vi.fn(),
      })),
    })),
  },
}));
vi.mock('firebase-admin/firestore', () => ({
  FieldValue: { serverTimestamp: () => '__SERVER_TS__' },
}));
vi.mock('@/lib/mfa', () => ({
  generateTotpSecret: mocks.generateTotpSecret,
  getTotpQrUrl: mocks.getTotpQrUrl,
  renderTotpQrDataUrl: mocks.renderTotpQrDataUrl,
}));

import { POST } from './route';

const request = () => new NextRequest('http://localhost/api/auth/mfa/totp/setup', { method: 'POST' });

beforeEach(() => {
  mocks.requireAuthWithProfile.mockReset().mockResolvedValue({
    profile: { uid: 'admin-1', role: 'admin' },
    token: { email: 'token@example.com' },
  });
  mocks.refUpdate.mockReset().mockResolvedValue(undefined);
  mocks.get
    .mockReset()
    .mockResolvedValue({
      exists: true,
      data: () => ({ email: 'admin@example.com' }),
      ref: { update: mocks.refUpdate },
    });
  mocks.generateTotpSecret.mockReset().mockReturnValue('NEWSECRET');
  mocks.getTotpQrUrl.mockReset().mockReturnValue('otpauth://totp/x');
  mocks.renderTotpQrDataUrl.mockReset().mockResolvedValue('data:image/png;base64,AAAA');
});

describe('POST /api/auth/mfa/totp/setup', () => {
  it('rejects unauthenticated callers', async () => {
    mocks.requireAuthWithProfile.mockResolvedValue(
      NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    );

    const response = await POST(request());

    expect(response.status).toBe(401);
    expect(mocks.generateTotpSecret).not.toHaveBeenCalled();
  });

  it('requires an administrator', async () => {
    mocks.requireAuthWithProfile.mockResolvedValue({
      profile: { uid: 'user-1', role: 'customer' },
    });

    const response = await POST(request());

    expect(response.status).toBe(403);
    expect(mocks.generateTotpSecret).not.toHaveBeenCalled();
  });

  it('404s when the profile is missing', async () => {
    mocks.get.mockResolvedValue({ exists: false });

    const response = await POST(request());

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({ code: 'USER_PROFILE_NOT_FOUND' });
  });

  it('stores a new unconfirmed secret and returns the QR payload', async () => {
    const response = await POST(request());

    expect(mocks.refUpdate).toHaveBeenCalledWith({
      'mfa.totp': { secret: 'NEWSECRET', enabled: false, backupCodes: [] },
      'mfa.required': true,
      updatedAt: '__SERVER_TS__',
    });
    expect(mocks.getTotpQrUrl).toHaveBeenCalledWith(
      'NEWSECRET',
      'ShipIN Admin',
      'admin@example.com'
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      secret: 'NEWSECRET',
      qrUrl: 'otpauth://totp/x',
      qrDataUrl: 'data:image/png;base64,AAAA',
    });
  });

  it('falls back to the token email, then the uid', async () => {
    await POST(request());
    expect(mocks.getTotpQrUrl.mock.calls[0][2]).toBe('admin@example.com');

    mocks.get.mockResolvedValue({
      exists: true,
      data: () => ({}),
      ref: { update: mocks.refUpdate },
    });
    await POST(request());
    expect(mocks.getTotpQrUrl.mock.calls[1][2]).toBe('token@example.com');

    mocks.requireAuthWithProfile.mockResolvedValue({
      profile: { uid: 'admin-9', role: 'admin' },
      token: {},
    });
    await POST(request());
    expect(mocks.getTotpQrUrl.mock.calls[2][2]).toBe('admin-9');
  });
});
