/**
 * Tests for the administrator authorization gate.
 *
 * The gate is security-critical, so each refusal reason is asserted
 * individually: authentication, role, MFA setup, and each MFA factor.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  users: new Map<string, Record<string, unknown>>(),
  updates: [] as { uid: string; data: Record<string, unknown> }[],
  verifyIdToken: vi.fn(),
  verifyAppCheckRequest: vi.fn(),
  verifyTotp: vi.fn(),
  verifyBackupCode: vi.fn(),
  getUser: vi.fn(),
  getMfaSession: vi.fn(),
}));

vi.mock('@/lib/firebaseAdmin', () => ({
  adminAuth: { verifyIdToken: mocks.verifyIdToken, getUser: mocks.getUser },
  adminDb: {
    collection: () => ({
      doc: (uid: string) => ({
        get: async () => {
          const data = mocks.users.get(uid);
          return { exists: data !== undefined, data: () => data };
        },
        update: async (data: Record<string, unknown>) => {
          mocks.updates.push({ uid, data });
        },
      }),
    }),
  },
}));

vi.mock('@/lib/appCheck', () => ({
  verifyAppCheckRequest: mocks.verifyAppCheckRequest,
}));

vi.mock('firebase-admin/firestore', () => ({
  FieldValue: { delete: () => '__DELETE__' },
}));

vi.mock('@/lib/mfa', () => ({
  verifyTotp: mocks.verifyTotp,
  verifyBackupCode: mocks.verifyBackupCode,

}));

vi.mock('@/lib/mfaSession', () => ({
  getMfaSession: mocks.getMfaSession,
}));

// Imported per file instead of statically: with a shared module registry the
// first file to import adminAuth decides which `@/lib/firebaseAdmin` mock it
// binds to, so a static import can inherit another file's database stub.
let getAdminAuthError: typeof import('./adminAuth').getAdminAuthError;
let requireAdmin: typeof import('./adminAuth').requireAdmin;

const UID = 'admin-1';

function request(headers: Record<string, string> = {}): Request {
  return new Request('https://shipin-psi.vercel.app/api/admin/x', { headers });
}

function bearer(headers: Record<string, string> = {}): Request {
  return request({ authorization: 'Bearer id-token', ...headers });
}

function adminUser(overrides: Record<string, unknown> = {}) {
  return {
    role: 'admin',
    email: 'admin@shipin.app',
    mfa: {
      totp: { enabled: true, secret: 'SECRET', backupCodes: ['hash-1'] },
    },
    ...overrides,
  };
}

beforeEach(async () => {
  vi.resetModules();
  ({ getAdminAuthError, requireAdmin } = await import('./adminAuth'));
  mocks.users.clear();
  mocks.updates.length = 0;
  mocks.verifyIdToken.mockReset();
  mocks.verifyAppCheckRequest.mockReset();
  mocks.verifyAppCheckRequest.mockResolvedValue('not-enforced');
  mocks.verifyTotp.mockReset();
  mocks.verifyBackupCode.mockReset();
  mocks.getUser.mockReset();
  mocks.getUser.mockResolvedValue({ multiFactor: { enrolledFactors: [] } });

  mocks.getMfaSession.mockReset();
  mocks.getMfaSession.mockReturnValue(null);
  mocks.verifyIdToken.mockResolvedValue({
    uid: UID,
    email: 'token@shipin.app',
    email_verified: true,
  });
  mocks.users.set(UID, adminUser());
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('requireAdmin — authentication', () => {
  it('requires an authorization header', async () => {
    await expect(requireAdmin(request())).rejects.toThrow('AUTHENTICATION_REQUIRED');
  });

  it('requires the Bearer scheme', async () => {
    await expect(
      requireAdmin(request({ authorization: 'Basic abc' }))
    ).rejects.toThrow('AUTHENTICATION_REQUIRED');
  });

  it('rejects an empty bearer token', async () => {
    await expect(
      requireAdmin(request({ authorization: 'Bearer ' }))
    ).rejects.toThrow('AUTHENTICATION_REQUIRED');
  });

  it('rejects a token that does not verify', async () => {
    mocks.verifyIdToken.mockRejectedValue(new Error('expired'));

    await expect(requireAdmin(bearer())).rejects.toThrow('INVALID_AUTHENTICATION');
  });

  it('checks the token for revocation so a ban takes effect immediately', async () => {
    await expect(requireAdmin(bearer())).rejects.toThrow('MFA_REQUIRED');

    // 1h-stale ID tokens still verify; only the revoked-token check (the second
    // argument) makes a disabled/revoked Firebase account stop working now.
    expect(mocks.verifyIdToken).toHaveBeenCalledWith('id-token', true);
  });
});

describe('requireAdmin — profile and role', () => {
  it('requires an existing profile', async () => {
    mocks.verifyIdToken.mockResolvedValue({ uid: 'missing-user', email_verified: true });

    await expect(requireAdmin(bearer())).rejects.toThrow('USER_PROFILE_NOT_FOUND');
  });

  it('requires the admin role', async () => {
    mocks.users.set(UID, adminUser({ role: 'customer' }));

    await expect(requireAdmin(bearer())).rejects.toThrow('ADMIN_ACCESS_REQUIRED');
  });

  it.each([
    [{ disabled: true }, 'ACCOUNT_DISABLED'],
    [{ suspended: true }, 'ACCOUNT_SUSPENDED'],
    [{ banned: true }, 'ACCOUNT_BANNED'],
    [{ deletedAt: new Date() }, 'ACCOUNT_DELETED'],
  ])('refuses a blocked administrator (%j)', async (block, code) => {
    mocks.users.set(UID, adminUser(block));

    await expect(requireAdmin(bearer({ 'x-mfa-totp': '123456' }))).rejects.toThrow(code);
  });

  it('checks account state before MFA so a banned admin never reaches a factor', async () => {
    mocks.users.set(UID, adminUser({ banned: true }));

    await expect(requireAdmin(bearer())).rejects.toThrow('ACCOUNT_BANNED');
    expect(mocks.verifyTotp).not.toHaveBeenCalled();
  });
});

describe('requireAdmin — elevated MFA session', () => {
  it('accepts a verified session for a security-key-only admin', async () => {
    mocks.users.set(UID, adminUser({
      mfa: {
        webauthn: {
          enabled: true,
          credentialIds: ['cred-1'],
        },
      },
    }));
    mocks.getMfaSession.mockReturnValue({ uid: UID, expiresAt: Date.now() + 60_000 });

    await expect(requireAdmin(bearer())).resolves.toMatchObject({
      uid: UID,
      mfaVerified: true,
    });
  });

  it("ignores a session issued to another account", async () => {
    mocks.users.set(UID, adminUser({ mfa: { webauthn: { enabled: true, credentialIds: ['c'] } } }));
    mocks.getMfaSession.mockReturnValue({ uid: 'someone-else', expiresAt: Date.now() + 60_000 });

    await expect(requireAdmin(bearer())).rejects.toThrow('MFA_REQUIRED');
  });

  it('still requires a code when there is no session', async () => {
    mocks.users.set(UID, adminUser({ mfa: { webauthn: { enabled: true, credentialIds: ['c'] } } }));

    await expect(requireAdmin(bearer())).rejects.toThrow('MFA_REQUIRED');
  });
});

describe('requireAdmin — MFA enforcement', () => {
  it('demands enrolment when no factor is configured', async () => {
    mocks.users.set(UID, adminUser({ mfa: {} }));

    await expect(requireAdmin(bearer())).rejects.toThrow('MFA_SETUP_REQUIRED');
  });

  it('demands a code when factors exist but none is supplied', async () => {
    await expect(requireAdmin(bearer())).rejects.toThrow('MFA_REQUIRED');
  });

  it('accepts a valid TOTP code', async () => {
    mocks.verifyTotp.mockReturnValue(true);

    await expect(requireAdmin(bearer({ 'x-mfa-totp': '123456' }))).resolves.toEqual({
      uid: UID,
      email: 'token@shipin.app',
      displayName: undefined,
      mfaVerified: true,
    });
    expect(mocks.verifyTotp).toHaveBeenCalledWith('SECRET', '123456', 1);
  });

  it('rejects an invalid TOTP code', async () => {
    mocks.verifyTotp.mockReturnValue(false);

    await expect(requireAdmin(bearer({ 'x-mfa-totp': '000000' }))).rejects.toThrow(
      'MFA_REQUIRED'
    );
  });

  it('accepts a valid backup code', async () => {
    mocks.verifyBackupCode.mockReturnValue(0);

    await expect(
      requireAdmin(bearer({ 'x-mfa-backup': 'abcd-efgh' }))
    ).resolves.toMatchObject({ mfaVerified: true });
    expect(mocks.verifyBackupCode).toHaveBeenCalledWith('abcd-efgh', ['hash-1']);
  });

  it('rejects an unknown backup code', async () => {
    mocks.verifyBackupCode.mockReturnValue(-1);

    await expect(
      requireAdmin(bearer({ 'x-mfa-backup': 'wrong' }))
    ).rejects.toThrow('MFA_REQUIRED');
  });

  it('accepts a token Firebase already elevated with a second factor', async () => {
    // Identity Platform verifies SMS itself, so a token carrying
    // sign_in_second_factor could not exist before that challenge passed.
    mocks.users.set(UID, adminUser({ mfa: {} }));
    mocks.verifyIdToken.mockResolvedValue({
      uid: UID,
      email: 'token@shipin.app',
      email_verified: true,
      firebase: { sign_in_second_factor: 'phone' },
    });

    await expect(requireAdmin(bearer())).resolves.toMatchObject({ mfaVerified: true });
  });

  it('treats an Auth-enrolled factor as configured MFA', async () => {
    mocks.users.set(UID, adminUser({ mfa: {} }));
    mocks.getUser.mockResolvedValue({
      multiFactor: { enrolledFactors: [{ factorId: 'phone', phoneNumber: '+15551234567' }] },
    });

    await expect(requireAdmin(bearer())).rejects.toThrow('MFA_REQUIRED');
    expect(mocks.getUser).toHaveBeenCalledWith(UID);
  });

  it('ignores the removed custom SMS header', async () => {
    mocks.users.set(UID, adminUser({ mfa: {} }));

    await expect(requireAdmin(bearer({ 'x-mfa-sms': '123456' }))).rejects.toThrow(
      'MFA_SETUP_REQUIRED'
    );
  });

  it('ignores a WebAuthn header at the gate (fail closed)', async () => {
    mocks.users.set(
      UID,
      adminUser({
        mfa: { webauthn: { enabled: true, credentialIds: ['cred-1'] } },
      })
    );

    await expect(
      requireAdmin(bearer({ 'x-mfa-webauthn': 'assertion' }))
    ).rejects.toThrow('MFA_REQUIRED');
  });

  it('falls back to the stored profile for identity fields', async () => {
    mocks.verifyIdToken.mockResolvedValue({ uid: UID, email_verified: true });
    mocks.users.set(UID, adminUser({ displayName: 'Stored Admin' }));
    mocks.verifyTotp.mockReturnValue(true);

    await expect(requireAdmin(bearer({ 'x-mfa-totp': '123456' }))).resolves.toEqual({
      uid: UID,
      email: 'admin@shipin.app',
      displayName: 'Stored Admin',
      mfaVerified: true,
    });
  });
});

describe('requireAdmin — App Check and verified email', () => {
  it('rejects a request without an App Check token when enforcement is on', async () => {
    mocks.verifyAppCheckRequest.mockResolvedValue('missing');

    await expect(requireAdmin(bearer())).rejects.toThrow('APP_CHECK_FAILED');

    // The gate runs before token verification, so an unverified client never
    // costs a Firebase lookup.
    expect(mocks.verifyIdToken).not.toHaveBeenCalled();
  });

  it('rejects an invalid App Check token', async () => {
    mocks.verifyAppCheckRequest.mockResolvedValue('invalid');

    await expect(requireAdmin(bearer())).rejects.toThrow('APP_CHECK_FAILED');
  });

  it('rejects an administrator whose email is not verified', async () => {
    mocks.verifyIdToken.mockResolvedValue({ uid: UID, email_verified: false });

    await expect(requireAdmin(bearer())).rejects.toThrow('EMAIL_VERIFICATION_REQUIRED');
  });

  it('accepts a verified administrator once App Check and MFA pass', async () => {
    mocks.verifyTotp.mockReturnValue(true);

    await expect(
      requireAdmin(bearer({ 'x-mfa-totp': '123456' }))
    ).resolves.toMatchObject({ uid: UID, mfaVerified: true });
  });
});

describe('getAdminAuthError', () => {
  it.each([
    ['AUTHENTICATION_REQUIRED', 401, 'Authentication required.'],
    ['INVALID_AUTHENTICATION', 401, 'Invalid authentication.'],
    ['USER_PROFILE_NOT_FOUND', 403, 'User profile not found.'],
    ['ADMIN_ACCESS_REQUIRED', 403, 'Administrator access required.'],
    ['MFA_REQUIRED', 401, 'Multi-factor authentication required.'],
    ['APP_CHECK_FAILED', 401, 'App verification failed.'],
    ['EMAIL_VERIFICATION_REQUIRED', 403, 'verify your email'],
    ['MFA_SETUP_REQUIRED', 403, 'Multi-factor authentication is required'],
    ['ACCOUNT_DISABLED', 403, 'no longer allowed'],
    ['ACCOUNT_SUSPENDED', 403, 'no longer allowed'],
    ['ACCOUNT_BANNED', 403, 'no longer allowed'],
    ['ACCOUNT_DELETED', 403, 'no longer allowed'],
  ])('maps %s to %i', (message, status, error) => {
    const result = getAdminAuthError(new Error(message));

    expect(result.status).toBe(status);
    expect(result.error).toContain(error);
  });

  it('falls back to 500 for unknown errors and non-errors', () => {
    expect(getAdminAuthError(new Error('boom'))).toEqual({
      status: 500,
      error: 'Unable to verify administrator access.',
    });
    expect(getAdminAuthError('boom')).toEqual({
      status: 500,
      error: 'Unable to verify administrator access.',
    });
  });
});
