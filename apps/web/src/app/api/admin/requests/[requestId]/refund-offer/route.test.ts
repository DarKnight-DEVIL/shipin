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
    collection: () => ({ doc: () => ({ get: mocks.get, update: mocks.update }) }),
  },
}));

vi.mock('@/lib/adminAudit', () => ({
  __esModule: true,
  default: vi.fn(),
  recordAdminAudit: mocks.recordAdminAudit,
}));

vi.mock('firebase-admin/firestore', () => ({
  FieldValue: { serverTimestamp: () => '__SERVER_TS__' },
}));

import { POST } from './route';

const context = (requestId = 'req-1') => ({ params: Promise.resolve({ requestId }) });

const request = (body: unknown = { reason: 'Damaged in transit' }) =>
  new NextRequest('http://localhost/api/admin/requests/req-1/refund-offer', {
    method: 'POST',
    body: JSON.stringify(body),
  });

const purchased = {
  status: 'purchased',
  payment: { amountPaid: 120, amount: 100 },
};

const respondWith = (data: Record<string, unknown> | undefined) =>
  mocks.get.mockResolvedValue({
    exists: data !== undefined,
    data: () => data,
  });

beforeEach(() => {
  mocks.requireAdmin.mockReset().mockResolvedValue({ uid: 'admin', email: undefined });
  mocks.getAdminAuthError.mockReset().mockReturnValue({ status: 500, error: 'Internal error' });
  mocks.update.mockReset().mockResolvedValue(undefined);
  mocks.recordAdminAudit.mockReset().mockResolvedValue(undefined);
  respondWith(purchased);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('POST /api/admin/requests/[requestId]/refund-offer', () => {
  it('passes admin auth failures through', async () => {
    mocks.requireAdmin.mockRejectedValue(new Error('ADMIN_ACCESS_REQUIRED'));
    mocks.getAdminAuthError.mockReturnValue({ status: 403, error: 'Admin access required.' });

    const response = await POST(request(), context());

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: 'Admin access required.',
    });
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('maps known auth errors even when the helper reports 500', async () => {
    mocks.requireAdmin.mockRejectedValue(new Error('AUTHENTICATION_REQUIRED'));
    mocks.getAdminAuthError.mockReturnValue({ status: 500, error: 'Authentication required.' });

    const response = await POST(request(), context());

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: 'Authentication required.',
    });
  });

  it('turns unexpected failures into a generic error', async () => {
    mocks.requireAdmin.mockRejectedValue(new Error('boom'));

    const response = await POST(request(), context());

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: 'Unable to offer refund.',
    });
    expect(console.error).toHaveBeenCalledWith('Admin refund offer error:', expect.any(Error));
  });

  it('404s for an unknown request', async () => {
    respondWith(undefined);

    const response = await POST(request(), context());

    expect(response.status).toBe(404);
  });

  it('requires a reason', async () => {
    const response = await POST(request({ reason: '   ' }), context());

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: 'A reason is required to offer a refund.',
    });
  });

  it('only offers refunds on purchased orders', async () => {
    respondWith({ status: 'quote_accepted', payment: { amountPaid: 10 } });

    const response = await POST(request(), context());

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: 'A refund can only be offered after the order has been purchased.',
    });
  });

  it('refuses when a refund request already exists', async () => {
    respondWith({ ...purchased, refundRequest: { status: 'requested' } });

    const response = await POST(request(), context());

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: 'A refund request already exists.',
    });
  });

  it('refuses a second offer', async () => {
    respondWith({ ...purchased, refundOffer: { offered: true } });

    const response = await POST(request(), context());

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: 'A refund has already been offered.',
    });
  });

  it('requires a recorded payment', async () => {
    respondWith({ status: 'purchased' });

    const response = await POST(request(), context());

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: 'No payment was found for this request.',
    });
  });

  it('rejects a non-positive payment amount', async () => {
    respondWith({ status: 'purchased', payment: { amountPaid: 0 } });

    const response = await POST(request(), context());

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: 'Invalid payment amount.',
    });
  });

  it('records the offer using the amount actually paid', async () => {
    const response = await POST(request(), context());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      requestId: 'req-1',
      status: 'refund_offered',
      refundOffer: { amount: 120, reason: 'Damaged in transit' },
    });
    const updateCall = mocks.update.mock.calls[0][0];
    expect(updateCall.status).toBe('refund_offered');
    expect(updateCall.refundOffer).toMatchObject({ offered: true, reason: 'Damaged in transit', amount: 120 });
    expect(updateCall.refundOffer.offeredAt).toBe('__SERVER_TS__');
    expect(updateCall['statusHistory.refund_offered']).toBe('__SERVER_TS__');
    expect(updateCall.updatedAt).toBe('__SERVER_TS__');
    expect(mocks.recordAdminAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUid: 'admin',
        actorEmail: undefined,
        action: 'refund.offered',
        targetType: 'request',
        targetId: 'req-1',
        detail: { amount: 120, reason: 'Damaged in transit' },
      })
    );
  });

  it('falls back to the quoted amount and audits the event', async () => {
    respondWith({ status: 'purchased', payment: { amount: 80 } });

    const response = await POST(request(), context());

    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({ refundOffer: { amount: 80, reason: 'Damaged in transit' } })
    );
    const updateCall = mocks.update.mock.calls[0][0];
    expect(updateCall.status).toBe('refund_offered');
    expect(updateCall.refundOffer).toMatchObject({ offered: true, reason: 'Damaged in transit', amount: 80 });
    expect(updateCall.refundOffer.offeredAt).toBe('__SERVER_TS__');
    expect(updateCall['statusHistory.refund_offered']).toBe('__SERVER_TS__');
    expect(updateCall.updatedAt).toBe('__SERVER_TS__');
    expect(mocks.recordAdminAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUid: 'admin',
        actorEmail: undefined,
        action: 'refund.offered',
        targetType: 'request',
        targetId: 'req-1',
        detail: { amount: 80, reason: 'Damaged in transit' },
      })
    );
  });

  it('still returns the persisted refund offer when recordAdminAudit rejects', async () => {
    mocks.requireAdmin.mockResolvedValue({ uid: 'admin' });
    mocks.recordAdminAudit.mockRejectedValue(new Error('write-failed'));

    const response = await POST(request(), context());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      requestId: 'req-1',
      status: 'refund_offered',
      refundOffer: { amount: 120, reason: 'Damaged in transit' },
    });
    const updateCall = mocks.update.mock.calls[0][0];
    expect(updateCall.status).toBe('refund_offered');
    expect(updateCall.refundOffer).toMatchObject({ offered: true, amount: 120, reason: 'Damaged in transit' });
  });
});
