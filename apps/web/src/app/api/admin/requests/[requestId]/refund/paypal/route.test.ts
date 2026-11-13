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

const request = (
  body: unknown = { amount: 100, transactionId: 'tx-1' },
  token: string | null = 'token-1'
) =>
  new NextRequest('http://localhost/api/admin/requests/req-1/refund/paypal', {
    method: 'POST',
    headers: token ? { authorization: `Bearer ${token}` } : {},
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

const refundRequest = (overrides: Record<string, unknown> = {}) => ({
  status: 'requested',
  preference: 'original_sources',
  amount: 120,
  walletAmount: 20,
  paypalAmount: 100,
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
  respondWith({
    status: 'refund_requested',
    refundRequest: refundRequest({ walletStatus: 'completed' }),
  });
});

describe('POST /api/admin/requests/[requestId]/refund/paypal', () => {
  it('records the PayPal portion and completes the refund when the wallet part is done', async () => {
    const response = await POST(request(), context());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      requestId: 'req-1',
      refund: { amount: 100, transactionId: 'tx-1', status: 'completed' },
    });

    expect(mocks.txUpdate).toHaveBeenCalledWith(expect.any(Object), {
      'refundRequest.paypalRefundStatus': 'completed',
      'refundRequest.paypalRefundAmount': 100,
      'refundRequest.paypalRefundTransactionId': 'tx-1',
      'refundRequest.paypalRefundedAt': '__SERVER_TS__',
      'refundRequest.status': 'completed',
      'refundRequest.processedAt': '__SERVER_TS__',
      status: 'refunded',
      'statusHistory.refunded': '__SERVER_TS__',
      updatedAt: '__SERVER_TS__',
    });

    expect(mocks.recordAdminAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'refund.paypal_recorded',
        targetId: 'req-1',
        detail: { amount: 100, transactionId: 'tx-1', fullyRefunded: true },
      })
    );
  });

  it('leaves the request open while the wallet portion is outstanding', async () => {
    respondWith({ status: 'refund_requested', refundRequest: refundRequest() });

    const response = await POST(request(), context());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      refund: { status: 'requested' },
    });

    const payload = mocks.txUpdate.mock.calls[0][1] as Record<string, unknown>;
    expect(payload.status).toBeUndefined();
    expect(payload['refundRequest.paypalRefundStatus']).toBe('completed');
  });

  it('rejects an amount larger than the PayPal portion', async () => {
    const response = await POST(request({ amount: 150, transactionId: 'tx-1' }), context());

    expect(response.status).toBe(400);
    expect(mocks.txUpdate).not.toHaveBeenCalled();
  });

  it('rejects a request with no refund workflow', async () => {
    respondWith({ status: 'purchased' });

    const response = await POST(request(), context());

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: 'No refund workflow exists for this request.',
    });
  });

  it('rejects a refund that is already completed', async () => {
    respondWith({
      refundRequest: refundRequest({ status: 'completed', walletStatus: 'completed' }),
    });

    const response = await POST(request(), context());

    expect(response.status).toBe(400);
    expect(mocks.txUpdate).not.toHaveBeenCalled();
  });

  it('rejects a duplicate PayPal portion', async () => {
    respondWith({
      refundRequest: refundRequest({ paypalRefundStatus: 'completed' }),
    });

    const response = await POST(request(), context());

    expect(response.status).toBe(400);
    expect(mocks.txUpdate).not.toHaveBeenCalled();
  });

  it('rejects a refund with no PayPal portion at all', async () => {
    respondWith({
      refundRequest: refundRequest({ walletAmount: 120, paypalAmount: 0 }),
    });

    const response = await POST(request(), context());

    expect(response.status).toBe(400);
  });

  it('404s for an unknown request', async () => {
    respondWith(undefined);

    const response = await POST(request(), context());

    expect(response.status).toBe(404);
  });

  it('rejects an invalid body before touching Firestore', async () => {
    const noTransactionId = await POST(request({ amount: 100 }), context());
    expect(noTransactionId.status).toBe(400);

    const zeroAmount = await POST(request({ amount: 0, transactionId: 'tx-1' }), context());
    expect(zeroAmount.status).toBe(400);

    const unparseable = await POST(request('{not json'), context());
    expect(unparseable.status).toBe(400);

    expect(mocks.runTransaction).not.toHaveBeenCalled();
  });

  it('passes an authentication failure through as 401', async () => {
    mocks.requireAdmin.mockRejectedValue(new Error('AUTHENTICATION_REQUIRED'));
    mocks.getAdminAuthError.mockReturnValue({
      status: 401,
      error: 'Authentication required.',
    });

    const response = await POST(request(), context());

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
