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

import { POST } from './route';

const context = (requestId = 'req-1') => ({ params: Promise.resolve({ requestId }) });

const body = (overrides: Record<string, unknown> = {}) => ({
  quote: {
    items: [{ name: 'Desk lamp', quantity: 1, unitPrice: 40, subtotal: 40 }],
    breakdown: {
      productsTotal: 40,
      domesticShipping: 5,
      internationalShipping: 25,
      serviceFee: 10,
      grandTotal: 80,
    },
    ...overrides,
  },
});

const post = (payload: unknown = body()) =>
  new NextRequest('http://localhost/api/requests/req-1/quote', {
    method: 'POST',
    body: JSON.stringify(payload),
    headers: { 'Content-Type': 'application/json' },
  });

const respondWith = (data: Record<string, unknown> | undefined) =>
  mocks.get.mockResolvedValue({ exists: data !== undefined, data: () => data });

beforeEach(() => {
  mocks.requireAdmin.mockReset().mockResolvedValue({ uid: 'admin-1' });
  mocks.update.mockReset().mockResolvedValue(undefined);
  respondWith({ status: 'review' });
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('POST /api/requests/[requestId]/quote', () => {
  it('rejects with the auth response when the caller is not an admin', async () => {
    mocks.requireAdmin.mockResolvedValue(
      NextResponse.json({ success: false, error: 'Admin only' }, { status: 403 })
    );

    const response = await POST(post(), context());

    expect(response.status).toBe(403);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('publishes the quote, recomputes the total and opens payment', async () => {
    const response = await POST(post(), context());
    expect(response.status).toBe(200);

    const update = mocks.update.mock.calls[0][0];
    // 40 + 5 + 25 + 10 = 80, ignoring the client-supplied grandTotal.
    expect(update.quote.breakdown.grandTotal).toBe(80);
    expect(update.quote.expiresAt).toBeInstanceOf(Date);
    expect(update.quote.acceptedAt).toBeNull();
    expect(update.quote.expired).toBe(false);
    expect(update.quote.version).toBe(1);
    expect(update.quote.regeneratedCount).toBe(1);
    expect(update.status).toBe('awaiting_payment');
    expect(update.quoteRegenerationRequested).toBe(false);
  });

  it('ignores a client grandTotal that disagrees with the components', async () => {
    const payload = body();
    payload.quote.breakdown.grandTotal = 1;

    await POST(post(payload), context());

    expect(mocks.update.mock.calls[0][0].quote.breakdown.grandTotal).toBe(80);
  });

  it('increments version and regeneration count for an existing quote', async () => {
    respondWith({ status: 'awaiting_payment', quote: { version: 3, regeneratedCount: 4 } });

    await POST(post(), context());

    const update = mocks.update.mock.calls[0][0];
    expect(update.quote.version).toBe(4);
    expect(update.quote.regeneratedCount).toBe(5);
  });

  it('refuses to quote a request that is past payment', async () => {
    respondWith({ status: 'paid' });

    const response = await POST(post(), context());

    expect(response.status).toBe(409);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('refuses a zero total', async () => {
    const payload = body();
    payload.quote.breakdown = {
      productsTotal: 0,
      domesticShipping: 0,
      internationalShipping: 0,
      serviceFee: 0,
      grandTotal: 0,
    };

    const response = await POST(post(payload), context());

    expect(response.status).toBe(400);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('rejects an empty item list', async () => {
    const payload = body();
    payload.quote.items = [];

    const response = await POST(post(payload), context());

    expect(response.status).toBe(400);
  });

  it('rejects a body that is not JSON', async () => {
    const request = new NextRequest('http://localhost/api/requests/req-1/quote', {
      method: 'POST',
      body: 'not-json',
      headers: { 'Content-Type': 'application/json' },
    });

    const response = await POST(request, context());

    expect(response.status).toBe(400);
  });

  it('returns 404 for an unknown request', async () => {
    respondWith(undefined);

    const response = await POST(post(), context());

    expect(response.status).toBe(404);
  });

  it('returns 400 for an invalid request id', async () => {
    const response = await POST(post(), { params: Promise.resolve({ requestId: '' }) });

    expect(response.status).toBe(400);
  });
});
