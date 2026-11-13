import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  getAdminAuthError: vi.fn(),
  get: vi.fn(),
  runTransaction: vi.fn(),
  txUpdate: vi.fn(),
  recordAdminAudit: vi.fn(),
}));

vi.mock('@/lib/adminAuth', () => ({
  requireAdmin: mocks.requireAdmin,
  getAdminAuthError: mocks.getAdminAuthError,
}));

vi.mock('@/lib/adminAudit', () => ({
  recordAdminAudit: mocks.recordAdminAudit,
}));

vi.mock('@/lib/firebaseAdmin', () => ({
  adminDb: {
    collection: () => ({ doc: () => ({ get: mocks.get, update: mocks.txUpdate }) }),
    runTransaction: mocks.runTransaction,
  },
}));

vi.mock('firebase-admin/firestore', () => ({
  FieldValue: { serverTimestamp: () => '__SERVER_TS__' },
}));

import { POST } from './route';

const context = (requestId = 'req-1') => ({ params: Promise.resolve({ requestId }) });

const request = (token: string | null = 'token-1') =>
  new NextRequest('http://localhost/api/admin/requests/req-1/refund/complete', {
    method: 'POST',
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });

const refundRequest = (overrides: Record<string, unknown> = {}) => ({
  status: 'requested',
  amount: 120,
  walletAmount: 20,
  paypalAmount: 100,
  walletStatus: 'completed',
  paypalRefundStatus: 'completed',
  ...overrides,
});

const respondWith = (data?: Record<string, unknown>) =>
  mocks.get.mockResolvedValue({
    exists: data !== undefined,
    data: () => data,
  });

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  mocks.requireAdmin.mockReset().mockResolvedValue({ uid: 'admin-1', email: 'admin@shipin.test' });
  mocks.getAdminAuthError
    .mockReset()
    .mockReturnValue({ status: 401, error: 'Authentication required.' });
  mocks.get.mockReset();
  mocks.txUpdate.mockReset();
  mocks.recordAdminAudit.mockReset().mockResolvedValue(undefined);
  mocks.runTransaction
    .mockReset()
    .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({ get: mocks.get, update: mocks.txUpdate })
    );
  respondWith({ status: 'refund_requested', refundRequest: refundRequest() });
});

describe('POST /api/admin/requests/[requestId]/refund/complete', () => {
  it('marks the request refunded once both portions are done', async () => {
    const response = await POST(request(), context());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      requestId: 'req-1',
      status: 'refunded',
      alreadyCompleted: false,
    });

    expect(mocks.txUpdate).toHaveBeenCalledWith(expect.any(Object), {
      'refundRequest.status': 'completed',
      'refundRequest.processedAt': '__SERVER_TS__',
      status: 'refunded',
      'statusHistory.refunded': '__SERVER_TS__',
      updatedAt: '__SERVER_TS__',
    });

    expect(mocks.recordAdminAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'refund.completed',
        targetId: 'req-1',
        detail: { amount: 120, alreadyCompleted: false },
      })
    );
  });

  it('is a no-op for a refund that is already completed', async () => {
    respondWith({ status: 'refunded', refundRequest: refundRequest({ status: 'completed' }) });

    const response = await POST(request(), context());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      alreadyCompleted: true,
    });
    expect(mocks.txUpdate).not.toHaveBeenCalled();
  });

  it('refuses to complete while the wallet portion is outstanding', async () => {
    respondWith({ refundRequest: refundRequest({ walletStatus: undefined }) });

    const response = await POST(request(), context());

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: 'Credit the wallet portion of this refund before completing it.',
    });
    expect(mocks.txUpdate).not.toHaveBeenCalled();
  });

  it('refuses to complete while the PayPal portion is outstanding', async () => {
    respondWith({ refundRequest: refundRequest({ paypalRefundStatus: undefined }) });

    const response = await POST(request(), context());

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: 'Record the PayPal refund before completing it.',
    });
    expect(mocks.txUpdate).not.toHaveBeenCalled();
  });

  it('treats a zero portion as already handled', async () => {
    respondWith({
      refundRequest: refundRequest({
        walletAmount: 0,
        paypalAmount: 0,
        walletStatus: undefined,
        paypalRefundStatus: undefined,
      }),
    });

    const response = await POST(request(), context());

    expect(response.status).toBe(200);
    expect(mocks.txUpdate).toHaveBeenCalledTimes(1);
  });

  it('rejects a request with no refund workflow', async () => {
    respondWith({ status: 'purchased' });

    const response = await POST(request(), context());

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: 'No refund workflow exists for this request.',
    });
  });

  it('404s for an unknown request', async () => {
    respondWith(undefined);

    const response = await POST(request(), context());

    expect(response.status).toBe(404);
  });

  it('passes an authentication failure through as 401', async () => {
    mocks.requireAdmin.mockRejectedValue(new Error('AUTHENTICATION_REQUIRED'));

    const response = await POST(request(null), context());

    expect(response.status).toBe(401);
    expect(mocks.runTransaction).not.toHaveBeenCalled();
  });

  it('requires the admin role', async () => {
    mocks.requireAdmin.mockRejectedValue(new Error('ADMIN_ACCESS_REQUIRED'));
    mocks.getAdminAuthError.mockReturnValue({
      status: 403,
      error: 'Administrator access required.',
    });

    const response = await POST(request(), context());

    expect(response.status).toBe(403);
  });
});
