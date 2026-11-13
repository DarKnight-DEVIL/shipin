import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const mocks = vi.hoisted(() => ({
  requireAuthWithProfile: vi.fn(),
  get: vi.fn(),
  refUpdate: vi.fn(),
  readStoredCredentials: vi.fn(),
  buildRegistrationOptions: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({ requireAuthWithProfile: mocks.requireAuthWithProfile }));
vi.mock('@/lib/firebaseAdmin', () => ({
  adminDb: {
    collection: vi.fn(() => ({ doc: vi.fn(() => ({ get: mocks.get })) })),
  },
}));
vi.mock('@/lib/webauthn', () => ({
  readStoredCredentials: mocks.readStoredCredentials,
  buildRegistrationOptions: mocks.buildRegistrationOptions,
}));

import { POST } from './route';

const request = () =>
  new NextRequest('http://localhost/api/auth/mfa/webauthn/register/start', { method: 'POST' });

const userDoc = (data: Record<string, unknown>) => ({
  exists: true,
  data: () => data,
  ref: { update: mocks.refUpdate },
});

beforeEach(() => {
  mocks.requireAuthWithProfile.mockReset().mockResolvedValue({
    profile: { uid: 'admin-1', role: 'admin' },
    token: { email: 'token@example.com', name: 'Token Name' },
  });
  mocks.get.mockReset().mockResolvedValue(userDoc({ email: 'admin@example.com' }));
  mocks.refUpdate.mockReset().mockResolvedValue(undefined);
  mocks.readStoredCredentials.mockReset().mockReturnValue([]);
  mocks.buildRegistrationOptions.mockReset().mockResolvedValue({ challenge: 'CHALLENGE' });
});

describe('POST /api/auth/mfa/webauthn/register/start', () => {
  it('rejects unauthenticated callers', async () => {
    mocks.requireAuthWithProfile.mockResolvedValue(
      NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    );

    const response = await POST(request());

    expect(response.status).toBe(401);
    expect(mocks.buildRegistrationOptions).not.toHaveBeenCalled();
  });

  it('requires an administrator', async () => {
    mocks.requireAuthWithProfile.mockResolvedValue({
      profile: { uid: 'user-1', role: 'customer' },
    });

    const response = await POST(request());

    expect(response.status).toBe(403);
  });

  it('404s when the profile is missing', async () => {
    mocks.get.mockResolvedValue({ exists: false });

    const response = await POST(request());

    expect(response.status).toBe(404);
  });

  it('builds options and stores the challenge', async () => {
    mocks.readStoredCredentials.mockReturnValue([{ credentialID: 'cred-1' }]);
    const now = 1_800_000_000_000;
    vi.spyOn(Date, 'now').mockReturnValue(now);

    const response = await POST(request());

    expect(mocks.buildRegistrationOptions).toHaveBeenCalledWith({
      uid: 'admin-1',
      userName: 'admin@example.com',
      displayName: 'Token Name',
      excludeCredentials: [{ credentialID: 'cred-1' }],
    });
    expect(mocks.refUpdate).toHaveBeenCalledWith({
      'mfa.webauthn.pendingChallenge': 'CHALLENGE',
      'mfa.webauthn.pendingExpires': now + 5 * 60 * 1000,
    });
    await expect(response.json()).resolves.toEqual({ success: true, options: { challenge: 'CHALLENGE' } });
    vi.restoreAllMocks();
  });

  it('falls back to the token email, then a local address', async () => {
    mocks.get.mockResolvedValue(userDoc({}));
    await POST(request());
    expect(mocks.buildRegistrationOptions.mock.calls[0][0].userName).toBe('token@example.com');

    mocks.requireAuthWithProfile.mockResolvedValue({
      profile: { uid: 'admin-9', role: 'admin' },
      token: {},
    });
    await POST(request());
    expect(mocks.buildRegistrationOptions.mock.calls[1][0]).toMatchObject({
      userName: 'admin-9@shipin.local',
      displayName: 'admin-9@shipin.local',
    });
  });
});
