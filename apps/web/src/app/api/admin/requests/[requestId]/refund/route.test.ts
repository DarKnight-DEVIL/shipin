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

const request = () =>
  new NextRequest('http://localhost/api/admin/requests/req-1/refund', { method: 'POST' });

const purchased = {
  status: 'purchased',
  payment: { amountPaid: 120, walletAmount: 20, paypalAmount: 100 },
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

describe('POST /api/admin/requests/[requestId]/refund', () => {
  it('passes a non-500 auth failure through', async () => {
    mocks.requireAdmin.mockRejectedValue(new Error('nope'));
    mocks.getAdminAuthError.mockReturnValue({ status: 401, error: 'Authentication required.' });

    const response = await POST(request(), context());

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: 'Authentication required.',
    });
  });

  it('maps a known auth message even when the helper reports 500', async () => {
    mocks.requireAdmin.mockRejectedValue(new Error('USER_PROFILE_NOT_FOUND'));

    const response = await POST(request(), context());

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ success: false, error: 'Internal error' });
  });

  it('turns unexpected failures into a generic error', async () => {
    mocks.requireAdmin.mockRejectedValue(new Error('boom'));

    const response = await POST(request(), context());

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: 'Unable to initiate admin refund.',
    });
    expect(console.error).toHaveBeenCalledWith(
      'Admin refund initiation error:',
      expect.any(Error)
    );
  });

  it('requires a request id', async () => {
    const response = await POST(request(), context(''));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: 'Request ID is required.',
    });
  });

  it('404s for an unknown request', async () => {
    respondWith(undefined);

    const response = await POST(request(), context());

    expect(response.status).toBe(404);
  });

  it('only refunds purchased orders', async () => {
    respondWith({ status: 'delivered', payment: { amountPaid: 10 } });

    const response = await POST(request(), context());

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: 'An admin refund can only be initiated for a purchased request.',
    });
  });

  it('refuses a duplicate refund workflow', async () => {
    respondWith({ ...purchased, refundRequest: { status: 'requested' } });

    const response = await POST(request(), context());

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: 'A refund workflow already exists for this request.',
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

  it('rejects a non-positive total', async () => {
    respondWith({ status: 'purchased', payment: { amount: 0 } });

    const response = await POST(request(), context());

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: 'Invalid payment amount.',
    });
  });

  it('rejects a negative breakdown', async () => {
    respondWith({ status: 'purchased', payment: { amountPaid: 100, walletAmount: -5 } });

    const response = await POST(request(), context());

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: 'Invalid payment breakdown.',
    });
  });

  it('creates the admin-initiated refund workflow', async () => {
    const response = await POST(request(), context());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      requestId: 'req-1',
      status: 'refund_requested',
      refundRequest: {
        status: 'requested',
        amount: 120,
        walletAmount: 20,
        paypalAmount: 100,
      },
    });
    const updateCall = mocks.update.mock.calls[0][0];
    expect(updateCall).toMatchObject({
      status: 'refund_requested',
      refundRequest: { status: 'requested', preference: 'original_sources', amount: 120, walletAmount: 20, paypalAmount: 100 },
    });
    expect(updateCall['statusHistory.refund_requested']).toBe('__SERVER_TS__');
    expect(updateCall.updatedAt).toBe('__SERVER_TS__');
    expect(mocks.recordAdminAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUid: 'admin',
        actorEmail: undefined,
        action: 'refund.initiated',
        targetType: 'request',
        targetId: 'req-1',
        detail: { amount: 120, walletAmount: 20, paypalAmount: 100 },
      })
    );
  });

  it('normalises a missing breakdown to zero and audits the event', async () => {
    respondWith({ status: 'purchased', payment: { amountPaid: 60 } });

    const response = await POST(request(), context());

    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        refundRequest: { status: 'requested', amount: 60, walletAmount: 0, paypalAmount: 0 },
      })
    );
    const updateCall2 = mocks.update.mock.calls[0][0];
    expect(updateCall2).toMatchObject({
      status: 'refund_requested',
      refundRequest: { status: 'requested', amount: 60, walletAmount: 0, paypalAmount: 0 },
    });
    expect(updateCall2['statusHistory.refund_requested']).toBe('__SERVER_TS__');
    expect(updateCall2.updatedAt).toBe('__SERVER_TS__');
    expect(mocks.recordAdminAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUid: 'admin',
        actorEmail: undefined,
        action: 'refund.initiated',
        targetType: 'request',
        targetId: 'req-1',
        detail: { amount: 60, walletAmount: 0, paypalAmount: 0 },
      })
    );
  });

  it('does not return a 200 when recordAdminAudit rejects', async () => {
    mocks.recordAdminAudit.mockRejectedValue(new Error('write-failed'));

    const response = await POST(request(), context());

    expect(response.status).not.toBe(200);
    expect(mocks.update).toHaveBeenCalledTimes(1);
    expect(response.status).toBeGreaterThanOrEqual(400);
  });
});
