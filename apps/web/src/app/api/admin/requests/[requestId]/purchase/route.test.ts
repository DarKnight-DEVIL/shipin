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
  Timestamp: { now: () => '__NOW__' },
}));

import { PATCH } from './route';

const context = (requestId = 'req-1') => ({ params: Promise.resolve({ requestId }) });

const patch = (payload: unknown) =>
  new NextRequest('http://localhost/api/admin/requests/req-1/purchase', {
    method: 'PATCH',
    body: JSON.stringify(payload),
    headers: { 'Content-Type': 'application/json' },
  });

const purchase = (overrides: Record<string, unknown> = {}) => ({
  vendor: 'Amazon India',
  amount: 128.4,
  ...overrides,
});

const respondWith = (data: Record<string, unknown> | undefined) =>
  mocks.get.mockResolvedValue({ exists: data !== undefined, data: () => data });

beforeEach(() => {
  mocks.requireAdmin.mockReset().mockResolvedValue({ uid: 'admin-1' });
  mocks.update.mockReset().mockResolvedValue(undefined);
  respondWith({ status: 'paid' });
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('PATCH /api/admin/requests/[requestId]/purchase', () => {
  it('returns the auth response for a non-admin caller', async () => {
    mocks.requireAdmin.mockResolvedValue(
      NextResponse.json({ success: false }, { status: 403 })
    );

    const response = await PATCH(patch(purchase()), context());

    expect(response.status).toBe(403);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('records the vendor and moves paid → purchased', async () => {
    const response = await PATCH(
      patch(purchase({ orderNumber: 'IN-402-8891', receiptUrl: 'https://x.test/r.pdf' })),
      context()
    );

    expect(response.status).toBe(200);

    const update = mocks.update.mock.calls[0][0];
    expect(update.status).toBe('purchased');
    expect(update['statusHistory.purchased']).toBe('__SERVER_TS__');
    expect(update.purchasedAt).toBe('__SERVER_TS__');
    expect(update.purchases).toHaveLength(1);
    expect(update.purchases[0]).toMatchObject({
      vendor: 'Amazon India',
      amount: 128.4,
      orderNumber: 'IN-402-8891',
      receiptUrl: 'https://x.test/r.pdf',
      recordedBy: 'admin-1',
    });
  });

  it('appends a second store without changing status again', async () => {
    respondWith({
      status: 'purchased',
      purchases: [{ vendor: 'Amazon India', amount: 100 }],
    });

    const response = await PATCH(patch(purchase({ vendor: 'Flipkart' })), context());

    expect(response.status).toBe(200);

    const update = mocks.update.mock.calls[0][0];
    expect(update.status).toBeUndefined();
    expect(update.purchasedAt).toBeUndefined();
    expect(update.purchases).toHaveLength(2);
    expect(update.purchases[1].vendor).toBe('Flipkart');
  });

  it('refuses a request that has not been paid', async () => {
    respondWith({ status: 'awaiting_payment' });

    const response = await PATCH(patch(purchase()), context());

    expect(response.status).toBe(409);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('requires a vendor', async () => {
    const response = await PATCH(patch({ amount: 10 }), context());

    expect(response.status).toBe(400);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('requires a positive amount', async () => {
    const response = await PATCH(patch({ vendor: 'Amazon', amount: 0 }), context());

    expect(response.status).toBe(400);
  });

  it('rejects a receipt link that is not a URL', async () => {
    const response = await PATCH(
      patch(purchase({ receiptUrl: 'not-a-link' })),
      context()
    );

    expect(response.status).toBe(400);
  });

  it('rejects a non-JSON body', async () => {
    const request = new NextRequest(
      'http://localhost/api/admin/requests/req-1/purchase',
      { method: 'PATCH', body: 'nope', headers: { 'Content-Type': 'application/json' } }
    );

    const response = await PATCH(request, context());

    expect(response.status).toBe(400);
  });

  it('returns 404 for an unknown request', async () => {
    respondWith(undefined);

    const response = await PATCH(patch(purchase()), context());

    expect(response.status).toBe(404);
  });
});
