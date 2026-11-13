import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  get: vi.fn(),
  update: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  requireAdmin: mocks.requireAdmin,
}));

vi.mock('@/lib/firebaseAdmin', () => ({
  adminDb: {
    collection: () => ({ doc: () => ({ get: mocks.get, update: mocks.update }) }),
  },
}));

vi.mock('firebase-admin/firestore', () => ({
  FieldValue: { serverTimestamp: () => '__SERVER_TS__' },
}));

import { PATCH } from './route';

const context = (requestId = 'req-1') => ({ params: Promise.resolve({ requestId }) });

const patch = (payload: unknown) =>
  new NextRequest('http://localhost/api/requests/req-1/status', {
    method: 'PATCH',
    body: JSON.stringify(payload),
    headers: { 'Content-Type': 'application/json' },
  });

const respondWith = (data: Record<string, unknown> | undefined) =>
  mocks.get.mockResolvedValue({ exists: data !== undefined, data: () => data });

beforeEach(() => {
  mocks.requireAdmin.mockReset().mockResolvedValue({ uid: 'admin-1' });
  mocks.update.mockReset().mockResolvedValue(undefined);
  respondWith({ status: 'paid' });
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('PATCH /api/requests/[requestId]/status', () => {
  it('returns the auth response for a non-admin caller', async () => {
    mocks.requireAdmin.mockResolvedValue(
      NextResponse.json({ success: false }, { status: 403 })
    );

    const response = await PATCH(patch({ status: 'purchased' }), context());

    expect(response.status).toBe(403);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('advances paid → purchased and stamps the history', async () => {
    const response = await PATCH(patch({ status: 'purchased' }), context());

    expect(response.status).toBe(200);
    const update = mocks.update.mock.calls[0][0];
    expect(update.status).toBe('purchased');
    expect(update['statusHistory.purchased']).toBe('__SERVER_TS__');
    expect(update.statusUpdatedBy).toBe('admin-1');
  });

  it('refuses to set paid by hand', async () => {
    const response = await PATCH(patch({ status: 'paid' }), context());

    expect(response.status).toBe(409);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('refuses a refund status, which the refund routes own', async () => {
    const response = await PATCH(patch({ status: 'refunded' }), context());

    expect(response.status).toBe(409);
  });

  it('refuses a transition that skips the pipeline', async () => {
    respondWith({ status: 'paid' });

    const response = await PATCH(patch({ status: 'delivered' }), context());

    expect(response.status).toBe(409);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('requires a reason to reject', async () => {
    respondWith({ status: 'review' });

    const response = await PATCH(patch({ status: 'rejected' }), context());

    expect(response.status).toBe(400);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('stores the rejection reason and timestamp', async () => {
    respondWith({ status: 'review' });

    const response = await PATCH(
      patch({ status: 'rejected', rejectionReason: 'Item out of stock' }),
      context()
    );

    expect(response.status).toBe(200);
    const update = mocks.update.mock.calls[0][0];
    expect(update.rejectionReason).toBe('Item out of stock');
    expect(update.rejectedAt).toBe('__SERVER_TS__');
  });

  it('treats a repeated transition as success', async () => {
    respondWith({ status: 'purchased' });

    const response = await PATCH(patch({ status: 'purchased' }), context());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.unchanged).toBe(true);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('rejects an unknown status value', async () => {
    const response = await PATCH(patch({ status: 'teleported' }), context());

    expect(response.status).toBe(400);
  });

  it('rejects a non-JSON body', async () => {
    const request = new NextRequest('http://localhost/api/requests/req-1/status', {
      method: 'PATCH',
      body: 'nope',
      headers: { 'Content-Type': 'application/json' },
    });

    const response = await PATCH(request, context());

    expect(response.status).toBe(400);
  });

  it('returns 404 for an unknown request', async () => {
    respondWith(undefined);

    const response = await PATCH(patch({ status: 'purchased' }), context());

    expect(response.status).toBe(404);
  });
});
