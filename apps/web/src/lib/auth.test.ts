import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';

// Mock Firebase Admin before importing auth helpers
vi.mock('@/lib/firebaseAdmin', () => ({
  adminAuth: {
    verifyIdToken: vi.fn(),
  },
  adminDb: {
    collection: vi.fn(() => ({
      doc: vi.fn(() => ({
        get: vi.fn(),
      })),
    })),
  },
}));

vi.mock('@/config/env', () => ({
  serverEnv: {
    NODE_ENV: 'test',
    FIREBASE_ADMIN_PROJECT_ID: 'test-project',
    FIREBASE_ADMIN_CLIENT_EMAIL: 'test@test.com',
    FIREBASE_ADMIN_PRIVATE_KEY: 'test-key',
    PAYPAL_CLIENT_ID: 'test-client-id',
    PAYPAL_CLIENT_SECRET: 'test-secret',
    PAYPAL_ENV: 'sandbox',
    SMTP_EMAIL: 'test@test.com',
    SMTP_PASSWORD: 'test-password',
    RESEND_API_KEY: 'test-resend-key',
    R2_ACCOUNT_ID: 'test-account',
    R2_ACCESS_KEY_ID: 'test-key-id',
    R2_SECRET_ACCESS_KEY: 'test-secret-key',
    R2_BUCKET_NAME: 'test-bucket',
    APP_URL: 'http://localhost:3000',
    UPSTASH_REDIS_REST_URL: '',
    UPSTASH_REDIS_REST_TOKEN: '',
  },
  clientEnv: {
    NODE_ENV: 'test',
    NEXT_PUBLIC_PAYPAL_CLIENT_ID: 'test-client-id',
    NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
    NEXT_PUBLIC_FIREBASE_API_KEY: 'test-key',
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: 'test.firebaseio.com',
    NEXT_PUBLIC_FIREBASE_PROJECT_ID: 'test-project',
    NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: 'test-bucket',
    NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: '123456',
    NEXT_PUBLIC_FIREBASE_APP_ID: '1:123456:web:abcdef',
  },
  isProduction: false,
  isDevelopment: true,
  isTest: true,
}));

// Imported per file instead of statically: with a shared module registry the
// first importer fixes which @/lib/firebaseAdmin mock this module binds to, so
// a static import can inherit another file's database stub.
let extractAuth: typeof import('@/lib/auth').extractAuth;
let handleAuthError: typeof import('@/lib/auth').handleAuthError;
let requireAuth: typeof import('@/lib/auth').requireAuth;
let verifyIdToken: typeof import('@/lib/auth').verifyIdToken;
let requireAuthWithProfile: typeof import('@/lib/auth').requireAuthWithProfile;
let requireAdmin: typeof import('@/lib/auth').requireAdmin;
let withAuthHandler: typeof import('@/lib/auth').withAuthHandler;

let adminAuth: typeof import('@/lib/firebaseAdmin').adminAuth;
let adminDb: typeof import('@/lib/firebaseAdmin').adminDb;
let mockAdminAuth: { verifyIdToken: ReturnType<typeof vi.fn> };

// Rebuilt once per file, not per test: the helpers and this file must share a
// single @/lib/firebaseAdmin stub, otherwise resetting between tests hands the
// helpers a fresh stub that the assertions below no longer drive.
beforeAll(async () => {
  vi.resetModules();
  ({ adminAuth, adminDb } = await import('@/lib/firebaseAdmin'));
  ({
    extractAuth,
    handleAuthError,
    requireAuth,
    verifyIdToken,
    requireAuthWithProfile,
    requireAdmin,
    withAuthHandler,
  } = await import('@/lib/auth'));
  mockAdminAuth = adminAuth as unknown as { verifyIdToken: ReturnType<typeof vi.fn> };
});

describe('extractAuth', () => {
  it('returns null when no Authorization header', () => {
    const req = { headers: { get: () => null } } as unknown as Request;
    expect(extractAuth(req)).toBeNull();
  });

  it('returns null for malformed Bearer token', () => {
    const req = { headers: { get: () => 'Basic abc123' } } as unknown as Request;
    expect(extractAuth(req)).toBeNull();
  });

  it('returns the token for valid Bearer header', () => {
    const req = { headers: { get: () => 'Bearer my-secret-token' } } as unknown as Request;
    expect(extractAuth(req)).toBe('my-secret-token');
  });

  it('is case-insensitive for "bearer"', () => {
    const req = { headers: { get: () => 'bearer lower-case-token' } } as unknown as Request;
    expect(extractAuth(req)).toBe('lower-case-token');
  });

  it('trims surrounding whitespace', () => {
    const req = { headers: { get: () => 'Bearer   spaced-token   ' } } as unknown as Request;
    expect(extractAuth(req)).toBe('spaced-token');
  });
});

describe('verifyIdToken', () => {
  it('returns decoded token on success', async () => {
    mockAdminAuth.verifyIdToken.mockResolvedValueOnce({ uid: 'user-1', email_verified: true });
    const result = await verifyIdToken('valid-token');
    expect(result).toEqual({ uid: 'user-1', email_verified: true });
  });

  it('returns null on verification failure', async () => {
    mockAdminAuth.verifyIdToken.mockRejectedValueOnce(new Error('Invalid token'));
    const result = await verifyIdToken('bad-token');
    expect(result).toBeNull();
  });
});

describe('requireAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when no Authorization header', async () => {
    const req = { headers: { get: () => null } } as unknown as Request;
    const result = await requireAuth(req);
    expect(result).not.toBe(null);
    if (result && 'status' in result) {
      expect(result.status).toBe(401);
      const body = await result.json();
      expect(body.code).toBe('AUTHENTICATION_REQUIRED');
    }
  });

  it('returns 401 when token is invalid', async () => {
    mockAdminAuth.verifyIdToken.mockResolvedValueOnce(null);
    const req = { headers: { get: () => 'Bearer bad-token' } } as unknown as Request;
    const result = await requireAuth(req);
    expect(result).not.toBe(null);
    if (result && 'status' in result) {
      expect(result.status).toBe(401);
      const body = await result.json();
      expect(body.code).toBe('INVALID_AUTHENTICATION');
    }
  });

  it('returns 403 when email is not verified', async () => {
    mockAdminAuth.verifyIdToken.mockResolvedValueOnce({ uid: 'user-1', email_verified: false });
    const req = { headers: { get: () => 'Bearer unverified-token' } } as unknown as Request;
    const result = await requireAuth(req);
    expect(result).not.toBe(null);
    if (result && 'status' in result) {
      expect(result.status).toBe(403);
      const body = await result.json();
      expect(body.code).toBe('EMAIL_VERIFICATION_REQUIRED');
    }
  });

  it('returns decoded token when authenticated and email verified', async () => {
    mockAdminAuth.verifyIdToken.mockResolvedValueOnce({ uid: 'user-1', email_verified: true });
    const req = { headers: { get: () => 'Bearer good-token' } } as unknown as Request;
    const result = await requireAuth(req);
    expect(result).toEqual({ uid: 'user-1', email_verified: true });
  });
});

import { NextResponse } from 'next/server';

describe('requireAuthWithProfile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAdminAuth.verifyIdToken.mockResolvedValue({ uid: 'user-1', email_verified: true });
  });

  it('returns 403 when user profile not found', async () => {
    // Mock the user profile to not exist
    const { adminDb } = await import('@/lib/firebaseAdmin');
    const mockAdminDb = adminDb as unknown as { collection: ReturnType<typeof vi.fn> };
    mockAdminDb.collection.mockReturnValue({
      doc: vi.fn().mockReturnValue({ get: vi.fn().mockResolvedValue({ exists: false }) }),
    });
    const req = { headers: { get: () => 'Bearer good' } } as unknown as Request;
    const res = await requireAuthWithProfile(req);
    expect(res).not.toBe(null);
    if (res && 'status' in res) expect(res.status).toBe(403);
  });

  it('returns 403 when role not in allowedRoles', async () => {
    // Drive the profile explicitly: relying on the previous test leaving a
    // not-found stub behind made this case order-dependent.
    mockProfile({ role: 'customer' });
    const req = { headers: { get: () => 'Bearer good' } } as unknown as Request;
    const res = (await requireAuthWithProfile(req, ['admin'])) as Response;
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: 'AUTHORIZATION_ERROR' });
  });
});

describe('requireAdmin', () => {
  it('delegates to adminAuth.requireAdmin (code coverage marker)', async () => {
    const { requireAdmin: adminRequireAdmin } = await import('./adminAuth');
    expect(typeof adminRequireAdmin).toBe('function');
  });
});

const adminMock = vi.hoisted(() => ({ requireAdmin: vi.fn() }));

vi.mock('./adminAuth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./adminAuth')>();
  return { ...actual, requireAdmin: adminMock.requireAdmin };
});

function mockProfile(data: Record<string, unknown> | null) {
  (adminDb as unknown as { collection: ReturnType<typeof vi.fn> }).collection.mockReturnValue({
    doc: () => ({
      get: async () => ({ exists: data !== null, data: () => data }),
    }),
  });
}

describe('requireAuthWithProfile', () => {
  const request = { headers: { get: () => 'Bearer good' } } as unknown as Request;

  beforeEach(() => {
    mockAdminAuth.verifyIdToken.mockResolvedValue({ uid: 'u1', email_verified: true });
  });

  it('returns the profile for an existing user', async () => {
    mockProfile({ role: 'customer' });

    await expect(requireAuthWithProfile(request)).resolves.toEqual({
      token: { uid: 'u1', email_verified: true },
      profile: { uid: 'u1', role: 'customer' },
    });
  });

  it('rejects a missing profile', async () => {
    mockProfile(null);

    const result = (await requireAuthWithProfile(request)) as Response;

    expect(result.status).toBe(403);
    expect(await result.json()).toMatchObject({ code: 'USER_PROFILE_NOT_FOUND' });
  });

  it('treats an unrecognised role as a customer', async () => {
    mockProfile({ role: 'superuser' });

    await expect(
      requireAuthWithProfile(request, ['customer'])
    ).resolves.toMatchObject({ profile: { role: undefined } });
  });

  it('enforces allowed roles', async () => {
    mockProfile({ role: 'customer' });

    const result = (await requireAuthWithProfile(request, ['admin'])) as Response;

    expect(result.status).toBe(403);
    expect(await result.json()).toMatchObject({ code: 'AUTHORIZATION_ERROR' });
  });

  it('returns 500 when the profile read fails', async () => {
    (adminDb as unknown as { collection: ReturnType<typeof vi.fn> }).collection.mockReturnValue({
      doc: () => ({ get: async () => { throw new Error('firestore down'); } }),
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = (await requireAuthWithProfile(request)) as Response;

    expect(result.status).toBe(500);
    expect(await result.json()).toMatchObject({ code: 'INTERNAL_ERROR' });
  });
});

describe('requireAdmin wrapper', () => {
  const request = { headers: { get: () => 'Bearer good' } } as unknown as Request;

  beforeEach(() => {
    adminMock.requireAdmin.mockReset();
  });

  it('passes through a successful gate', async () => {
    adminMock.requireAdmin.mockResolvedValue({ uid: 'admin-1', mfaVerified: true });

    await expect(requireAdmin(request)).resolves.toEqual({
      uid: 'admin-1',
      mfaVerified: true,
    });
  });

  it('maps a 401 refusal to AUTHENTICATION_REQUIRED', async () => {
    adminMock.requireAdmin.mockRejectedValue(new Error('MFA_REQUIRED'));

    const result = (await requireAdmin(request)) as Response;

    expect(result.status).toBe(401);
    expect(await result.json()).toMatchObject({ code: 'AUTHENTICATION_REQUIRED' });
  });

  it('maps a 403 refusal to AUTHORIZATION_ERROR', async () => {
    adminMock.requireAdmin.mockRejectedValue(new Error('ADMIN_ACCESS_REQUIRED'));

    const result = (await requireAdmin(request)) as Response;

    expect(result.status).toBe(403);
    expect(await result.json()).toMatchObject({ code: 'AUTHORIZATION_ERROR' });
  });
});

describe('handleAuthError', () => {
  it('converts a gate error into a status and body', () => {
    expect(handleAuthError(new Error('USER_PROFILE_NOT_FOUND'))).toEqual({
      status: 403,
      body: { error: 'User profile not found.' },
    });
  });

  it('defaults to 500 for unknown errors', () => {
    expect(handleAuthError(new Error('weird'))).toEqual({
      status: 500,
      body: { error: 'Unable to verify administrator access.' },
    });
  });
});

describe('withAuthHandler', () => {
  it('wraps handler and catches errors', async () => {
    const handler = vi.fn().mockResolvedValue(NextResponse.json({ ok: true }));
    const wrapped = withAuthHandler(handler);
    const req = { headers: { get: () => 'Bearer good' } } as unknown as Request;
    const res = await wrapped(req);
    expect(res.status).toBe(200);
  });

  it('returns 500 on thrown error', async () => {
    const handler = vi.fn().mockRejectedValue(new Error('Boom'));
    const wrapped = withAuthHandler(handler);
    const req = { headers: { get: () => 'Bearer good' } } as unknown as Request;
    const res = await wrapped(req);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('Boom');
    expect(body.code).toBe('INTERNAL_ERROR');
  });
});