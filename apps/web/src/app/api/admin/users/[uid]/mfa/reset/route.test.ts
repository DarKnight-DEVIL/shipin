import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  getAdminAuthError: vi.fn(),
  get: vi.fn(),
  update: vi.fn(),
  recordAdminAudit: vi.fn(),
}));

vi.mock('@/lib/adminAuth', () => ({
  requireAdmin: mocks.requireAdmin,
  getAdminAuthError: mocks.getAdminAuthError,
}));

vi.mock('@/lib/firebaseAdmin', () => ({
  adminDb: {
    collection: () => ({
      doc: () => ({ get: mocks.get, update: mocks.update }),
    }),
  },
}));

vi.mock('@/lib/adminAudit', () => ({
  recordAdminAudit: mocks.recordAdminAudit,
}));

vi.mock('firebase-admin/firestore', () => ({
  FieldValue: {
    delete: () => '__DELETE__',
    serverTimestamp: () => '__SERVER_TS__',
  },
}));

import { POST } from './route';

const POST_REQUEST = () =>
  new NextRequest('http://localhost:3000/api/admin/users/cust-1/mfa/reset', {
    method: 'POST',
  });

const context = (uid: string) => ({ params: Promise.resolve({ uid }) });

describe('POST /api/admin/users/[uid]/mfa/reset', () => {
  beforeEach(() => {
    mocks.requireAdmin.mockReset();
    mocks.getAdminAuthError.mockReset();
    mocks.get.mockReset();
    mocks.update.mockReset();
    mocks.recordAdminAudit.mockReset();

    mocks.requireAdmin.mockResolvedValue({
      uid: 'admin-1',
      email: 'admin@shipin.test',
    });
    mocks.getAdminAuthError.mockReturnValue({
      status: 403,
      error: 'Access denied.',
    });
    mocks.get.mockResolvedValue({ exists: true });
    mocks.update.mockResolvedValue(undefined);
    mocks.recordAdminAudit.mockResolvedValue(undefined);
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('clears every MFA factor and audits the actor', async () => {
    const res = await POST(POST_REQUEST(), context('cust-1'));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ success: true, uid: 'cust-1' });
    expect(mocks.update).toHaveBeenCalledWith({
      'mfa.totp': '__DELETE__',
      'mfa.sms': '__DELETE__',
      'mfa.webauthn': '__DELETE__',
      'mfa.resetAt': '__SERVER_TS__',
      'mfa.resetBy': 'admin-1',
    });
    expect(mocks.recordAdminAudit).toHaveBeenCalledWith({
      actorUid: 'admin-1',
      actorEmail: 'admin@shipin.test',
      action: 'mfa.reset',
      targetType: 'user',
      targetId: 'cust-1',
    });
    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  it('rejects an unauthenticated caller without touching the user', async () => {
    const denial = new Error('AUTHENTICATION_REQUIRED');
    mocks.requireAdmin.mockRejectedValue(denial);
    mocks.getAdminAuthError.mockReturnValue({
      status: 403,
      error: 'Access denied.',
    });

    const res = await POST(POST_REQUEST(), context('cust-1'));

    expect(res.status).toBe(403);
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.recordAdminAudit).not.toHaveBeenCalled();
  });

  it('returns 400 when the uid is empty', async () => {
    const res = await POST(POST_REQUEST(), context(''));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe('User ID is required.');
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('returns 404 for an unknown user', async () => {
    mocks.get.mockResolvedValue({ exists: false });

    const res = await POST(POST_REQUEST(), context('ghost'));
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error).toBe('User not found.');
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.recordAdminAudit).not.toHaveBeenCalled();
  });

  it('passes a known admin error through with its status', async () => {
    mocks.requireAdmin.mockRejectedValue(new Error('MFA_REQUIRED'));
    mocks.getAdminAuthError.mockReturnValue({
      status: 403,
      error: 'MFA verification required.',
    });

    const res = await POST(POST_REQUEST(), context('cust-1'));
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.error).toBe('MFA verification required.');
  });

  it('hides unexpected failures behind a 500', async () => {
    mocks.requireAdmin.mockRejectedValue(new Error('boom'));
    mocks.getAdminAuthError.mockReturnValue({ status: 500, error: 'boom' });

    const res = await POST(POST_REQUEST(), context('cust-1'));
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error).toBe('Unable to reset MFA.');
  });
});
