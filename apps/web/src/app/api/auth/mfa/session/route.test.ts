import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  verifyIdToken: vi.fn(),
  getUser: vi.fn(),
  update: vi.fn(),
  availableMfaMethods: vi.fn(),
  verifyMfaProof: vi.fn(),
  isChallengeExpired: vi.fn(),
  readStoredCredentials: vi.fn(),
  verifyAssertion: vi.fn(),
  getMfaSession: vi.fn(),
  createMfaSessionToken: vi.fn(),
  createMfaSessionCookieHeader: vi.fn(),
  clearMfaSessionCookieHeader: vi.fn(),
  record: vi.fn(),
  isRateLimited: vi.fn(),
  addRateLimitHeaders: vi.fn(),
}));

vi.mock('@/lib/firebaseAdmin', () => ({
  adminAuth: { verifyIdToken: mocks.verifyIdToken },
  adminDb: {
    collection: () => ({
      doc: () => ({ get: mocks.getUser, update: mocks.update }),
    }),
  },
}));
vi.mock('@/lib/mfaProof', () => ({
  availableMfaMethods: mocks.availableMfaMethods,
  verifyMfaProof: mocks.verifyMfaProof,
}));
vi.mock('@/lib/webauthn', () => ({
  isChallengeExpired: mocks.isChallengeExpired,
  readStoredCredentials: mocks.readStoredCredentials,
  verifyAssertion: mocks.verifyAssertion,
}));
vi.mock('@/lib/mfaSession', () => ({
  MFA_SESSION_TTL_MS: 900_000,
  getMfaSession: mocks.getMfaSession,
  createMfaSessionToken: mocks.createMfaSessionToken,
  createMfaSessionCookieHeader: mocks.createMfaSessionCookieHeader,
  clearMfaSessionCookieHeader: mocks.clearMfaSessionCookieHeader,
}));
vi.mock('@/lib/rateLimiter', () => ({
  loginRateLimiter: { record: mocks.record },
  isRateLimited: mocks.isRateLimited,
  addRateLimitHeaders: mocks.addRateLimitHeaders,
}));
vi.mock('firebase-admin/firestore', () => ({
  FieldValue: { delete: () => '__DELETE__', serverTimestamp: () => '__SERVER_TS__' },
}));

import { DELETE, GET, POST } from './route';

const authRequest = (body?: unknown) =>
  new NextRequest('http://localhost/api/auth/mfa/session', {
    method: body === undefined ? 'GET' : 'POST',
    headers: { authorization: 'Bearer token-1' },
    ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }),
  });

const adminProfile = {
  role: 'admin',
  mfa: {
    webauthn: {
      credentials: [{ credentialID: 'cred-1', counter: 1 }],
      pendingChallenge: 'challenge-1',
      pendingExpires: Date.now() + 60_000,
    },
  },
};

const limit = { allowed: true };

beforeEach(() => {
  mocks.verifyIdToken.mockReset().mockResolvedValue({ uid: 'admin-1', email: 'a@x.com' });
  mocks.getUser.mockReset().mockResolvedValue({ exists: true, data: () => adminProfile });
  mocks.update.mockReset().mockResolvedValue(undefined);
  mocks.availableMfaMethods.mockReset().mockReturnValue(['totp']);
  mocks.verifyMfaProof.mockReset().mockReturnValue({ ok: true, method: 'totp' });
  mocks.isChallengeExpired.mockReset().mockReturnValue(false);
  mocks.readStoredCredentials.mockReset().mockReturnValue([{ credentialID: 'cred-1', counter: 1 }]);
  mocks.verifyAssertion.mockReset().mockResolvedValue({ verified: true, newCounter: 2 });
  mocks.getMfaSession.mockReset().mockReturnValue(null);
  mocks.createMfaSessionToken.mockReset().mockReturnValue({ token: 'elevated', expiresAt: 42 });
  mocks.createMfaSessionCookieHeader.mockReset().mockReturnValue('mfa_session=elevated');
  mocks.clearMfaSessionCookieHeader.mockReset().mockReturnValue('mfa_session=');
  mocks.record.mockReset().mockResolvedValue(limit);
  mocks.isRateLimited.mockReset().mockReturnValue(false);
  mocks.addRateLimitHeaders.mockReset();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('GET /api/auth/mfa/session', () => {
  it('requires a bearer token', async () => {
    const response = await GET(new NextRequest('http://localhost/api/auth/mfa/session'));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({ code: 'AUTHENTICATION_REQUIRED' })
    );
  });

  it('rejects a token Firebase cannot verify', async () => {
    mocks.verifyIdToken.mockRejectedValue(new Error('bad'));

    const response = await GET(authRequest());

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({ code: 'INVALID_AUTHENTICATION' })
    );
  });

  it('rejects a missing profile', async () => {
    mocks.getUser.mockResolvedValue({ exists: false });

    const response = await GET(authRequest());

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({ code: 'USER_PROFILE_NOT_FOUND' })
    );
  });

  it('rejects non-admin callers', async () => {
    mocks.getUser.mockResolvedValue({ exists: true, data: () => ({ role: 'customer' }) });

    const response = await GET(authRequest());

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({ code: 'ADMIN_ACCESS_REQUIRED' })
    );
  });

  it('reports a non-elevated session', async () => {
    const response = await GET(authRequest());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      elevated: false,
      expiresAt: null,
      methods: ['totp'],
      sessionTtlMs: 900_000,
    });
  });

  it('reports an elevated session for the same admin', async () => {
    mocks.getMfaSession.mockReturnValue({ uid: 'admin-1', expiresAt: 42 });

    const response = await GET(authRequest());

    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({ elevated: true, expiresAt: 42 })
    );
  });

  it("does not elevate another user's session", async () => {
    mocks.getMfaSession.mockReturnValue({ uid: 'someone-else', expiresAt: 42 });

    const response = await GET(authRequest());

    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({ elevated: false, expiresAt: null })
    );
  });
});

describe('POST /api/auth/mfa/session', () => {
  it('rate limits verification attempts', async () => {
    mocks.isRateLimited.mockReturnValue(true);

    const response = await POST(authRequest({ method: 'totp', code: '123456' }));

    expect(response.status).toBe(429);
    expect(mocks.addRateLimitHeaders).toHaveBeenCalled();
    expect(mocks.verifyMfaProof).not.toHaveBeenCalled();
  });

  it('rejects an unreadable body', async () => {
    const response = await POST(authRequest('not json'));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({ code: 'INVALID_REQUEST_BODY' })
    );
  });

  it('rejects a malformed WebAuthn assertion', async () => {
    const response = await POST(authRequest({ method: 'webauthn', credential: { id: 'x' } }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({ code: 'WEBAUTHN_INVALID_RESPONSE' })
    );
  });

  it('requires a registered security key', async () => {
    mocks.readStoredCredentials.mockReturnValue([]);

    const response = await POST(
      authRequest({ method: 'webauthn', credential: validAssertion() })
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({ code: 'MFA_SETUP_REQUIRED' })
    );
  });

  it('rejects a missing or expired challenge', async () => {
    mocks.getUser.mockResolvedValue({ exists: true, data: () => ({ role: 'admin', mfa: {} }) });

    const response = await POST(
      authRequest({ method: 'webauthn', credential: validAssertion() })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({ code: 'WEBAUTHN_CHALLENGE_EXPIRED' })
    );
  });

  it('rejects a challenge the clock has passed', async () => {
    mocks.isChallengeExpired.mockReturnValue(true);

    const response = await POST(
      authRequest({ method: 'webauthn', credential: validAssertion() })
    );

    expect(response.status).toBe(400);
    expect(mocks.verifyAssertion).not.toHaveBeenCalled();
  });

  it('rejects an unknown credential and burns the challenge', async () => {
    mocks.readStoredCredentials.mockReturnValue([{ credentialID: 'someone-else', counter: 1 }]);

    const response = await POST(
      authRequest({ method: 'webauthn', credential: validAssertion() })
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({ code: 'WEBAUTHN_UNKNOWN_CREDENTIAL' })
    );
    expect(mocks.update).toHaveBeenCalledWith({
      'mfa.webauthn.pendingChallenge': null,
      'mfa.webauthn.pendingExpires': null,
    });
  });

  it('rejects a failed signature and burns the challenge', async () => {
    mocks.readStoredCredentials.mockReturnValue([{ credentialID: 'other', counter: 1 }]);
    mocks.verifyAssertion.mockResolvedValue({ verified: false });

    const response = await POST(
      authRequest({ method: 'webauthn', credential: validAssertion('other') })
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({ code: 'MFA_INVALID_CODE' })
    );
    expect(mocks.update).toHaveBeenCalled();
  });

  it('elevates after a verified security key and stores the counter', async () => {
    const response = await POST(
      authRequest({ method: 'webauthn', credential: validAssertion() })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({ elevated: true, method: 'webauthn', expiresAt: 42 })
    );
    expect(response.headers.get('set-cookie')).toContain('mfa_session=elevated');
    expect(mocks.update).toHaveBeenCalledWith({
      'mfa.webauthn.credentials': [{ credentialID: 'cred-1', counter: 2 }],
      'mfa.webauthn.pendingChallenge': null,
      'mfa.webauthn.pendingExpires': null,
    });
  });

  it('requires a verification code', async () => {
    const response = await POST(authRequest({ method: 'totp', code: '   ' }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({ code: 'MFA_CODE_REQUIRED' })
    );
  });

  it('reports an account with no MFA configured', async () => {
    mocks.verifyMfaProof.mockReturnValue({ ok: false, reason: 'NO_MFA_CONFIGURED' });

    const response = await POST(authRequest({ method: 'totp', code: '123456' }));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({ code: 'MFA_SETUP_REQUIRED' })
    );
  });

  it('rejects an incorrect code', async () => {
    mocks.verifyMfaProof.mockReturnValue({ ok: false, reason: 'MISMATCH' });

    const response = await POST(authRequest({ method: 'totp', code: '000000' }));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({ code: 'MFA_INVALID_CODE' })
    );
  });

  it('treats an unknown method as unspecified', async () => {
    const response = await POST(authRequest({ method: 'carrier-pigeon', code: '123456' }));

    expect(response.status).toBe(200);
    expect(mocks.verifyMfaProof).toHaveBeenCalledWith(adminProfile, {
      totp: undefined,
      backup: undefined,
      sms: undefined,
    });
  });

  it('consumes a one-time SMS challenge', async () => {
    mocks.verifyMfaProof.mockReturnValue({ ok: true, method: 'sms', consumeSmsChallenge: true });

    const response = await POST(authRequest({ method: 'sms', code: '123456' }));

    expect(response.status).toBe(200);
    expect(mocks.update).toHaveBeenCalledWith({
      'mfa.sms.pendingCode': '__DELETE__',
      'mfa.sms.pendingExpires': '__DELETE__',
    });
  });
});

describe('DELETE /api/auth/mfa/session', () => {
  it('clears the elevated cookie', async () => {
    const response = await DELETE();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true, elevated: false });
    expect(response.headers.get('set-cookie')).toContain('mfa_session=');
  });
});

function validAssertion(id = 'cred-1') {
  return {
    id,
    rawId: id,
    type: 'public-key',
    response: { clientDataJSON: 'x', authenticatorData: 'y', signature: 'z' },
  };
}
