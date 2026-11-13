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
  new NextRequest('http://localhost/api/requests/req-1/shipment-status', {
    method: 'PATCH',
    body: JSON.stringify(payload),
    headers: { 'Content-Type': 'application/json' },
  });

const respondWith = (data: Record<string, unknown> | undefined) =>
  mocks.get.mockResolvedValue({ exists: data !== undefined, data: () => data });

beforeEach(() => {
  mocks.requireAdmin.mockReset().mockResolvedValue({ uid: 'admin-1' });
  mocks.update.mockReset().mockResolvedValue(undefined);
  respondWith({ status: 'packed' });
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('PATCH /api/requests/[requestId]/shipment-status', () => {
  it('returns the auth response for a non-admin caller', async () => {
    mocks.requireAdmin.mockResolvedValue(
      NextResponse.json({ success: false }, { status: 403 })
    );

    const response = await PATCH(patch({ status: 'shipped' }), context());

    expect(response.status).toBe(403);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('moves packed → shipped and stamps tracking times', async () => {
    const response = await PATCH(patch({ status: 'shipped' }), context());

    expect(response.status).toBe(200);
    const update = mocks.update.mock.calls[0][0];
    expect(update.status).toBe('shipped');
    expect(update['statusHistory.shipped']).toBe('__SERVER_TS__');
    expect(update['tracking.shippedAt']).toBe('__SERVER_TS__');
  });

  it('refuses to skip a shipment step', async () => {
    respondWith({ status: 'packed' });

    const response = await PATCH(patch({ status: 'delivered' }), context());

    expect(response.status).toBe(409);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('refuses shipment progress before packing', async () => {
    respondWith({ status: 'warehouse_received' });

    const response = await PATCH(patch({ status: 'shipped' }), context());

    expect(response.status).toBe(409);
  });

  it('treats a repeated status as success', async () => {
    respondWith({ status: 'shipped' });

    const response = await PATCH(patch({ status: 'shipped' }), context());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.unchanged).toBe(true);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('rejects a status outside the shipment set', async () => {
    const response = await PATCH(patch({ status: 'paid' }), context());

    expect(response.status).toBe(400);
  });

  it('rejects a non-JSON body', async () => {
    const request = new NextRequest(
      'http://localhost/api/requests/req-1/shipment-status',
      { method: 'PATCH', body: 'nope', headers: { 'Content-Type': 'application/json' } }
    );

    const response = await PATCH(request, context());

    expect(response.status).toBe(400);
  });

  it('returns 404 for an unknown request', async () => {
    respondWith(undefined);

    const response = await PATCH(patch({ status: 'shipped' }), context());

    expect(response.status).toBe(404);
  });
});
