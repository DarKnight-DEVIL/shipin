import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from './route';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  getAdminAuthError: vi.fn(),
  get: vi.fn(),
  recordAdminAudit: vi.fn(),
}));

vi.mock('@/lib/adminAuth', () => ({
  requireAdmin: mocks.requireAdmin,
  getAdminAuthError: mocks.getAdminAuthError,
}));

vi.mock('@/lib/firebaseAdmin', () => ({
  adminDb: {
    collection: () => ({
      doc: () => ({ get: mocks.get }),
    }),
  },
}));

vi.mock('@/lib/adminAudit', () => ({
  __esModule: true,
  default: vi.fn(),
  recordAdminAudit: mocks.recordAdminAudit,
}));

vi.mock('firebase-admin/firestore', () => ({
  FieldValue: {
    serverTimestamp: () => '__SERVER_TS__',
  },
}));

const context = (uid = 'cust-1') => ({ params: Promise.resolve({ uid }) });

const request = () =>
  new NextRequest('http://localhost/api/admin/wallet/balance', {
    method: 'GET',
  });

describe('GET /api/admin/wallet/balance', () => {
  beforeEach(() => {
    mocks.requireAdmin.mockReset().mockResolvedValue({ uid: 'admin-1' });
    mocks.getAdminAuthError.mockReset().mockReturnValue({ status: 500, error: 'Internal error' });
    mocks.get.mockReset().mockResolvedValue({
      exists: true,
      data: () => ({
        wallet: { currentBalance: 500, updatedAt: { toMillis: () => 1234 } },
      }),
    });
    mocks.recordAdminAudit.mockReset().mockResolvedValue(undefined);
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('captures the audit event', async () => {
    const res = await GET(request(), context());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({
      success: true,
      uid: 'cust-1',
      balance: 500,
      updatedAt: 1234,
    });
    expect(mocks.recordAdminAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUid: 'admin-1',
        action: 'wallet.balance_read',
        targetType: 'user',
        targetId: 'cust-1',
        detail: expect.objectContaining({ balance: 500, updatedAt: 1234 }),
      })
    );
  });

  it('rejects an unauthenticated caller', async () => {
    mocks.requireAdmin.mockRejectedValue(new Error('AUTHENTICATION_REQUIRED'));
    mocks.getAdminAuthError.mockReturnValue({ status: 401, error: 'Auth required.' });

    const res = await GET(request(), context());
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.error).toBe('Auth required.');
    expect(mocks.recordAdminAudit).not.toHaveBeenCalled();
  });

  it('returns 400 for an empty uid', async () => {
    const res = await GET(request(), context(''));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('User ID is required.');
  });

  it('returns 404 for an unknown user', async () => {
    mocks.get.mockResolvedValue({ exists: false });
    const res = await GET(request(), context('ghost'));
    const body = await res.json();
    expect(res.status).toBe(404);
    expect(body.error).toBe('User not found.');
  });

  it('hides unexpected failures behind a 500', async () => {
    mocks.requireAdmin.mockRejectedValue(new Error('boom'));
    mocks.getAdminAuthError.mockReturnValue({ status: 500, error: 'boom' });
    const res = await GET(request(), context());
    const body = await res.json();
    expect(res.status).toBe(500);
    expect(body.error).toBe('Unable to read wallet balance.');
  });
});
