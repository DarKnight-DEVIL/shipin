import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const mocks = vi.hoisted(() => ({
  requireAuthWithProfile: vi.fn(),
  get: vi.fn(),
  update: vi.fn(),
  readStoredCredentials: vi.fn(),
  availableMfaMethods: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({ requireAuthWithProfile: mocks.requireAuthWithProfile }));
vi.mock('@/lib/firebaseAdmin', () => ({
  adminDb: {
    collection: vi.fn(() => ({ doc: vi.fn(() => ({ get: mocks.get, update: mocks.update })) })),
  },
}));
vi.mock('@/lib/webauthn', () => ({ readStoredCredentials: mocks.readStoredCredentials }));
vi.mock('@/lib/mfaProof', () => ({ availableMfaMethods: mocks.availableMfaMethods }));

import { DELETE } from './route';

const request = (body: unknown = { id: 'cred-1' }) =>
  new NextRequest('http://localhost/api/auth/mfa/webauthn/credentials', {
    method: 'DELETE',
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

const credentials = [{ credentialID: 'cred-1' }, { credentialID: 'cred-2' }];

beforeEach(() => {
  mocks.requireAuthWithProfile
    .mockReset()
    .mockResolvedValue({ profile: { uid: 'admin-1', role: 'admin' } });
  mocks.get.mockReset().mockResolvedValue({
    exists: true,
    data: () => ({ mfa: { totp: { enabled: true } } }),
  });
  mocks.update.mockReset().mockResolvedValue(undefined);
  mocks.readStoredCredentials.mockReset().mockReturnValue(credentials);
  mocks.availableMfaMethods.mockReset().mockReturnValue(['webauthn', 'totp']);
});

describe('DELETE /api/auth/mfa/webauthn/credentials', () => {
  it('rejects unauthenticated callers', async () => {
    mocks.requireAuthWithProfile.mockResolvedValue(
      NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    );

    const response = await DELETE(request());

    expect(response.status).toBe(401);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('requires an administrator', async () => {
    mocks.requireAuthWithProfile.mockResolvedValue({
      profile: { uid: 'user-1', role: 'customer' },
    });

    const response = await DELETE(request());

    expect(response.status).toBe(403);
  });

  it('requires a credential id', async () => {
    const response = await DELETE(request({}));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ code: 'INVALID_CREDENTIAL' });
  });

  it('treats an unreadable body as a missing credential id', async () => {
    const response = await DELETE(request('{broken'));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ code: 'INVALID_CREDENTIAL' });
    expect(mocks.get).not.toHaveBeenCalled();
  });

  it('404s when the profile is missing', async () => {
    mocks.get.mockResolvedValue({ exists: false });

    const response = await DELETE(request());

    expect(response.status).toBe(404);
  });

  it('404s for a key that is not registered', async () => {
    const response = await DELETE(request({ id: 'unknown' }));

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      code: 'WEBAUTHN_UNKNOWN_CREDENTIAL',
    });
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('refuses to remove the only second factor', async () => {
    mocks.readStoredCredentials.mockReturnValue([{ credentialID: 'cred-1' }]);
    mocks.availableMfaMethods.mockReturnValue(['webauthn']);

    const response = await DELETE(request());

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ code: 'WEBAUTHN_LAST_FACTOR' });
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('removes the key and keeps the rest', async () => {
    const response = await DELETE(request());

    expect(mocks.update).toHaveBeenCalledWith({
      'mfa.webauthn.credentials': [{ credentialID: 'cred-2' }],
      'mfa.webauthn.enabled': true,
      updatedAt: expect.any(Date),
    });
    await expect(response.json()).resolves.toEqual({ success: true, remaining: 1 });
  });

  it('disables WebAuthn when the last key goes but another factor remains', async () => {
    mocks.readStoredCredentials.mockReturnValue([{ credentialID: 'cred-1' }]);
    mocks.availableMfaMethods.mockReturnValue(['webauthn', 'totp']);

    await DELETE(request());

    expect(mocks.update.mock.calls[0][0]).toMatchObject({
      'mfa.webauthn.credentials': [],
      'mfa.webauthn.enabled': false,
    });
  });
});
