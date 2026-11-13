import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const mocks = vi.hoisted(() => ({
  requireAuthWithProfile: vi.fn(),
  get: vi.fn(),
  refUpdate: vi.fn(),
  readStoredCredentials: vi.fn(),
  verifyRegistration: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({ requireAuthWithProfile: mocks.requireAuthWithProfile }));
vi.mock('@/lib/firebaseAdmin', () => ({
  adminDb: {
    collection: vi.fn(() => ({ doc: vi.fn(() => ({ get: mocks.get })) })),
  },
}));
vi.mock('firebase-admin/firestore', () => ({
  FieldValue: { serverTimestamp: () => '__SERVER_TS__' },
}));
vi.mock('@/lib/webauthn', () => ({
  readStoredCredentials: mocks.readStoredCredentials,
  verifyRegistration: mocks.verifyRegistration,
}));

import { POST } from './route';

const request = (body: unknown = { credential: { id: 'new' } }) =>
  new NextRequest('http://localhost/api/auth/mfa/webauthn/register/complete', {
    method: 'POST',
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

const userDoc = (webauthn: Record<string, unknown>) => ({
  exists: true,
  data: () => ({ mfa: { webauthn } }),
  ref: { update: mocks.refUpdate },
});

beforeEach(() => {
  mocks.requireAuthWithProfile
    .mockReset()
    .mockResolvedValue({ profile: { uid: 'admin-1', role: 'admin' } });
  mocks.get.mockReset().mockResolvedValue(
    userDoc({ pendingChallenge: 'CHALLENGE', pendingExpires: Date.now() + 60_000 })
  );
  mocks.refUpdate.mockReset().mockResolvedValue(undefined);
  mocks.readStoredCredentials.mockReset().mockReturnValue([]);
  mocks.verifyRegistration.mockReset().mockResolvedValue({
    verified: true,
    credential: { credentialID: 'cred-1', publicKey: 'key' },
  });
});

describe('POST /api/auth/mfa/webauthn/register/complete', () => {
  it('rejects unauthenticated callers', async () => {
    mocks.requireAuthWithProfile.mockResolvedValue(
      NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    );

    const response = await POST(request());

    expect(response.status).toBe(401);
    expect(mocks.verifyRegistration).not.toHaveBeenCalled();
  });

  it('requires an administrator', async () => {
    mocks.requireAuthWithProfile.mockResolvedValue({
      profile: { uid: 'user-1', role: 'customer' },
    });

    const response = await POST(request());

    expect(response.status).toBe(403);
  });

  it('rejects a missing credential', async () => {
    const response = await POST(request({}));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ code: 'INVALID_CREDENTIAL' });
  });

  it('404s when the profile is missing', async () => {
    mocks.get.mockResolvedValue({ exists: false });

    const response = await POST(request());

    expect(response.status).toBe(404);
  });

  it('requires an unexpired pending challenge', async () => {
    mocks.get.mockResolvedValue(userDoc({}));
    const missing = await POST(request());

    mocks.get.mockResolvedValue(
      userDoc({ pendingChallenge: 'CHALLENGE', pendingExpires: Date.now() - 1 })
    );
    const expired = await POST(request());

    expect(missing.status).toBe(400);
    expect(expired.status).toBe(400);
    await expect(expired.json()).resolves.toMatchObject({ code: 'WEBAUTHN_CHALLENGE_EXPIRED' });
  });

  it('reports a failed attestation', async () => {
    mocks.verifyRegistration.mockResolvedValue({ verified: false });

    const response = await POST(request());

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      code: 'WEBAUTHN_VERIFICATION_FAILED',
    });
    expect(mocks.refUpdate).not.toHaveBeenCalled();
  });

  it('rejects a key that is already registered', async () => {
    mocks.readStoredCredentials.mockReturnValue([{ credentialID: 'cred-1' }]);

    const response = await POST(request());

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      code: 'WEBAUTHN_CREDENTIAL_EXISTS',
    });
  });

  it('stores the new key and clears the challenge', async () => {
    const response = await POST(request({ credential: { id: 'new' }, credentialName: 'YubiKey' }));

    expect(mocks.verifyRegistration).toHaveBeenCalledWith({
      response: { id: 'new' },
      expectedChallenge: 'CHALLENGE',
    });
    expect(mocks.refUpdate).toHaveBeenCalledWith({
      'mfa.webauthn.credentials': [
        { credentialID: 'cred-1', publicKey: 'key', name: 'YubiKey' },
      ],
      'mfa.webauthn.enabled': true,
      'mfa.webauthn.pendingChallenge': null,
      'mfa.webauthn.pendingExpires': null,
      'mfa.required': true,
      updatedAt: '__SERVER_TS__',
    });
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      credential: { id: 'cred-1', name: 'YubiKey' },
    });
  });

  it('defaults the key name', async () => {
    const response = await POST(request());

    expect((await response.json()).credential.name).toBe('Security Key');
  });
});
