import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  getAdminAuthError: vi.fn(),
  get: vi.fn(),
  update: vi.fn(),
}));

vi.mock('@/lib/adminAuth', () => ({
  requireAdmin: mocks.requireAdmin,
  getAdminAuthError: mocks.getAdminAuthError,
}));
vi.mock('@/lib/firebaseAdmin', () => ({
  adminDb: {
    collection: () => ({
      doc: (id?: string) => ({
        id: id ?? 'new-offer',
        get: mocks.get,
        update: mocks.update,
      }),
    }),
  },
}));
vi.mock('firebase-admin/firestore', () => ({
  FieldValue: { serverTimestamp: () => '__SERVER_TS__' },
}));

import { POST } from './route';

const context = (requestId = 'req-1') => ({ params: Promise.resolve({ requestId }) });

const request = (body: unknown = { amount: 40, reason: 'Late delivery' }) =>
  new NextRequest('http://localhost/api/admin/requests/req-1/partial-refund', {
    method: 'POST',
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

const baseRequest = {
  payment: { amountPaid: 100 },
  totalRefundedAmount: 0,
};

const respondWith = (data: Record<string, unknown> | undefined) =>
  mocks.get.mockResolvedValue({ exists: data !== undefined, data: () => data });

beforeEach(() => {
  mocks.requireAdmin.mockReset().mockResolvedValue({ uid: 'admin-1', email: 'a@x.com' });
  mocks.getAdminAuthError.mockReset().mockReturnValue({ status: 500, error: 'Internal error' });
  mocks.update.mockReset().mockResolvedValue(undefined);
  respondWith(baseRequest);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('POST /api/admin/requests/[requestId]/partial-refund', () => {
  it('passes admin auth failures straight through', async () => {
    mocks.requireAdmin.mockRejectedValue(new Error('ADMIN_ACCESS_REQUIRED'));
    mocks.getAdminAuthError.mockReturnValue({ status: 403, error: 'Admin access required.' });

    const response = await POST(request(), context());

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: 'Admin access required.',
    });
  });

  it('rethrows and reports unexpected failures', async () => {
    mocks.get.mockRejectedValue(new Error('firestore down'));

    const response = await POST(request(), context());

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: 'Unable to create partial refund offer.',
    });
    expect(console.error).toHaveBeenCalledWith(
      'Admin partial refund offer error:',
      expect.any(Error)
    );
  });

  it('rejects an invalid request id', async () => {
    const response = await POST(request(), context(''));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ success: false, error: 'Invalid request ID.' });
  });

  it('404s for an unknown request', async () => {
    respondWith(undefined);

    const response = await POST(request(), context());

    expect(response.status).toBe(404);
  });

  it('requires a payment', async () => {
    respondWith({ totalRefundedAmount: 0 });

    const response = await POST(request(), context());

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: 'No payment was found for this request.',
    });
  });

  it('rejects a non-positive payment amount', async () => {
    respondWith({ payment: { amountPaid: 0 } });

    const response = await POST(request(), context());

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: 'Invalid payment amount.',
    });
  });

  it('rejects an unreadable or invalid body', async () => {
    const unreadable = await POST(request('not json'), context());
    const invalid = await POST(request({ amount: 'lots', reason: '' }), context());

    expect([unreadable.status, invalid.status]).toEqual([500, 400]);
    await expect(invalid.json()).resolves.toEqual({
      success: false,
      error: 'Invalid request body.',
    });
  });

  it('rejects a corrupted refunded total', async () => {
    respondWith({ ...baseRequest, totalRefundedAmount: -5 });

    const response = await POST(request(), context());

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: 'Invalid existing refund total.',
    });
  });

  it('refuses once the full amount is refunded', async () => {
    respondWith({ payment: { amountPaid: 100 }, totalRefundedAmount: 100 });

    const response = await POST(request(), context());

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: 'The full amount has already been refunded.',
    });
  });

  it('refuses more than the remaining balance', async () => {
    respondWith({ payment: { amountPaid: 100 }, totalRefundedAmount: 80 });

    const response = await POST(request({ amount: 50, reason: 'Late' }), context());

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: 'Only $20.00 remains refundable.',
    });
  });

  it('refuses to stack a second active offer', async () => {
    respondWith({ ...baseRequest, partialRefundOffer: { status: 'offered' } });

    const response = await POST(request(), context());

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: 'A partial refund offer is already awaiting customer selection.',
    });
  });

  it('creates the offer and reports the remaining balance', async () => {
    const response = await POST(request(), context());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      requestId: 'req-1',
      offer: { id: 'new-offer', amount: 40, reason: 'Late delivery', status: 'offered' },
      remainingRefundable: 100,
    });
    expect(mocks.update).toHaveBeenCalledWith({
      partialRefundOffer: {
        id: 'new-offer',
        amount: 40,
        reason: 'Late delivery',
        status: 'offered',
        createdAt: '__SERVER_TS__',
        createdBy: 'admin-1',
        createdByEmail: 'a@x.com',
      },
      'statusHistory.partial_refund_offered': '__SERVER_TS__',
      updatedAt: '__SERVER_TS__',
    });
  });

  it('allows a new offer once the previous one was declined', async () => {
    respondWith({ ...baseRequest, partialRefundOffer: { status: 'declined' } });

    const response = await POST(request({ amount: 25, reason: 'Scratch' }), context());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({ offer: expect.objectContaining({ amount: 25 }) })
    );
  });
});
