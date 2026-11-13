import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const mocks = vi.hoisted(() => ({
  requireAuthWithProfile: vi.fn(),
  get: vi.fn(),
  update: vi.fn(),
  refUpdate: vi.fn(),
  readStoredCredentials: vi.fn(),
  buildAuthenticationOptions: vi.fn(),
  isChallengeExpired: vi.fn(),
  verifyAssertion: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({ requireAuthWithProfile: mocks.requireAuthWithProfile }));
vi.mock('@/lib/firebaseAdmin', () => ({
  adminDb: {
    collection: vi.fn(() => ({ doc: vi.fn(() => ({ get: mocks.get, update: mocks.update })) })),
  },
}));
vi.mock('firebase-admin/firestore', () => ({
  FieldValue: { serverTimestamp: () => '__SERVER_TS__' },
}));
vi.mock('@/lib/webauthn', () => ({
  readStoredCredentials: mocks.readStoredCredentials,
  buildAuthenticationOptions: mocks.buildAuthenticationOptions,
  isChallengeExpired: mocks.isChallengeExpired,
  verifyAssertion: mocks.verifyAssertion,
}));

import { POST } from './route';

const request = (body: unknown) =>
  new NextRequest('http://localhost/api/auth/mfa/webauthn/verify', {
    method: 'POST',
    body: JSON.stringify(body),
  });

const assertion = { id: 'cred-1', type: 'public-key', response: { signature: 'sig' } };

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
  mocks.update.mockReset().mockResolvedValue(undefined);
  mocks.refUpdate.mockReset().mockResolvedValue(undefined);
  mocks.readStoredCredentials
    .mockReset()
    .mockReturnValue([{ credentialID: 'cred-1', counter: 4 }]);
  mocks.buildAuthenticationOptions.mockReset().mockResolvedValue({ challenge: 'NEW' });
  mocks.isChallengeExpired.mockReset().mockReturnValue(false);
  mocks.verifyAssertion.mockReset().mockResolvedValue({ verified: true, newCounter: 5 });
});

describe('POST /api/auth/mfa/webauthn/verify', () => {
  it('rejects unauthenticated callers', async () => {
    mocks.requireAuthWithProfile.mockResolvedValue(
      NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    );

    const response = await POST(request({ verifyOnly: false }));

    expect(response.status).toBe(401);
    expect(mocks.buildAuthenticationOptions).not.toHaveBeenCalled();
  });

  it('requires an administrator', async () => {
    mocks.requireAuthWithProfile.mockResolvedValue({
      profile: { uid: 'user-1', role: 'customer' },
    });

    const response = await POST(request({ verifyOnly: false }));

    expect(response.status).toBe(403);
  });

  it('404s when the profile is missing', async () => {
    mocks.get.mockResolvedValue({ exists: false });

    const response = await POST(request({ verifyOnly: false }));

    expect(response.status).toBe(404);
  });

  describe('step 1 — assertion', () => {
    it('refuses when no key is registered', async () => {
      mocks.readStoredCredentials.mockReturnValue([]);

      const response = await POST(request({ verifyOnly: true, credential: assertion }));

      expect(response.status).toBe(403);
      await expect(response.json()).resolves.toMatchObject({ code: 'WEBAUTHN_NOT_CONFIGURED' });
    });

    it('requires a live challenge', async () => {
      mocks.get.mockResolvedValue(userDoc({}));
      const missing = await POST(request({ verifyOnly: true, credential: assertion }));

      mocks.get.mockResolvedValue(
        userDoc({ pendingChallenge: 'CHALLENGE', pendingExpires: Date.now() - 1 })
      );
      mocks.isChallengeExpired.mockReturnValue(true);
      const expired = await POST(request({ verifyOnly: true, credential: assertion }));

      expect(missing.status).toBe(400);
      expect(expired.status).toBe(400);
      await expect(expired.json()).resolves.toMatchObject({
        code: 'WEBAUTHN_CHALLENGE_EXPIRED',
      });
    });

    it('rejects a malformed credential', async () => {
      const response = await POST(
        request({ verifyOnly: true, credential: { id: 'cred-1', type: 'other' } })
      );

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toMatchObject({ code: 'INVALID_CREDENTIAL' });
    });

    it('rejects an unregistered key', async () => {
      const response = await POST(
        request({ verifyOnly: true, credential: { ...assertion, id: 'other' } })
      );

      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toMatchObject({
        code: 'WEBAUTHN_UNKNOWN_CREDENTIAL',
      });
    });

    it('rejects a failed assertion', async () => {
      mocks.verifyAssertion.mockResolvedValue({ verified: false });

      const response = await POST(request({ verifyOnly: true, credential: assertion }));

      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toMatchObject({
        code: 'WEBAUTHN_VERIFICATION_FAILED',
      });
      expect(mocks.refUpdate).not.toHaveBeenCalled();
    });

    it('consumes the challenge and stores the new counter', async () => {
      const response = await POST(request({ verifyOnly: true, credential: assertion }));

      expect(mocks.verifyAssertion).toHaveBeenCalledWith({
        response: assertion,
        expectedChallenge: 'CHALLENGE',
        credential: { credentialID: 'cred-1', counter: 4 },
      });
      expect(mocks.refUpdate).toHaveBeenCalledWith({
        'mfa.webauthn.pendingChallenge': null,
        'mfa.webauthn.pendingExpires': null,
        'mfa.webauthn.credentials': [{ credentialID: 'cred-1', counter: 5 }],
      });
      await expect(response.json()).resolves.toMatchObject({ success: true });
    });
  });

  describe('step 2 — options', () => {
    it('returns a fresh challenge and stores it', async () => {
      const now = 1_800_000_000_000;
      vi.spyOn(Date, 'now').mockReturnValue(now);

      const response = await POST(request({ verifyOnly: false }));

      expect(mocks.buildAuthenticationOptions).toHaveBeenCalledWith({
        allowCredentials: [{ credentialID: 'cred-1', counter: 4 }],
      });
      expect(mocks.update).toHaveBeenCalledWith({
        'mfa.webauthn.pendingChallenge': 'NEW',
        'mfa.webauthn.pendingExpires': now + 5 * 60 * 1000,
      });
      await expect(response.json()).resolves.toEqual({ success: true, options: { challenge: 'NEW' } });
      vi.restoreAllMocks();
    });
  });
});
