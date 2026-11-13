import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  verifyIdToken: vi.fn(),
  set: vi.fn(),
  getPayPalAccessToken: vi.fn(),
  fetch: vi.fn(),
}));

vi.mock('@/lib/firebaseAdmin', () => ({
  adminAuth: { verifyIdToken: mocks.verifyIdToken },
  adminDb: {
    collection: () => ({ doc: () => ({ set: mocks.set }) }),
  },
}));
vi.mock('@/lib/paypal', () => ({ getPayPalAccessToken: mocks.getPayPalAccessToken }));
vi.mock('@/config/env', () => ({
  serverEnv: { PAYPAL_API_URL: 'https://paypal.test' },
}));

import { POST } from './route';

const request = (body: unknown, headers: Record<string, string> = { authorization: 'Bearer token-1' }) =>
  new NextRequest('http://localhost/api/paypal/create-wallet-topup', {
    method: 'POST',
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

beforeEach(() => {
  mocks.verifyIdToken.mockReset().mockResolvedValue({ uid: 'user-1' });
  mocks.set.mockReset().mockResolvedValue(undefined);
  mocks.getPayPalAccessToken.mockReset().mockResolvedValue('access-token');
  mocks.fetch.mockReset().mockResolvedValue({
    ok: true,
    json: async () => ({ id: 'order-1' }),
  });
  vi.stubGlobal('fetch', mocks.fetch);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('POST /api/paypal/create-wallet-topup', () => {
  it('requires a bearer token', async () => {
    const missing = await POST(request({ amount: 10 }, {}));
    const wrongScheme = await POST(request({ amount: 10 }, { authorization: 'Token abc' }));

    expect([missing.status, wrongScheme.status]).toEqual([401, 401]);
    expect(mocks.verifyIdToken).not.toHaveBeenCalled();
  });

  it('rejects a non-numeric or non-positive amount', async () => {
    const notNumber = await POST(request({ amount: 'abc' }));
    const zero = await POST(request({ amount: 0 }));

    expect([notNumber.status, zero.status]).toEqual([400, 400]);
    await expect(zero.json()).resolves.toEqual({
      success: false,
      error: 'Invalid top-up amount.',
    });
  });

  it('enforces the $1–$10,000 bounds', async () => {
    const tooSmall = await POST(request({ amount: 0.5 }));
    const tooLarge = await POST(request({ amount: 10001 }));

    expect([tooSmall.status, tooLarge.status]).toEqual([400, 400]);
    await expect(tooLarge.json()).resolves.toEqual({
      success: false,
      error: 'Top-up amount must be between $1 and $10,000.',
    });
  });

  it('creates a PayPal order and records its owner', async () => {
    const response = await POST(request({ amount: 25 }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true, orderId: 'order-1' });

    expect(mocks.fetch).toHaveBeenCalledWith(
      'https://paypal.test/v2/checkout/orders',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer access-token' }),
      })
    );
    const sentBody = JSON.parse(mocks.fetch.mock.calls[0][1].body);
    expect(sentBody.purchase_units[0].amount).toEqual({ currency_code: 'USD', value: '25.00' });

    expect(mocks.set).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        amount: 25,
        currency: 'USD',
        orderId: 'order-1',
        status: 'created',
      })
    );
  });

  it('surfaces the PayPal error message', async () => {
    mocks.fetch.mockResolvedValue({
      ok: false,
      json: async () => ({ message: 'Card declined' }),
    });

    const response = await POST(request({ amount: 25 }));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: 'Card declined',
    });
    expect(mocks.set).not.toHaveBeenCalled();
  });

  it('falls back to a generic message when PayPal returns no message', async () => {
    mocks.fetch.mockResolvedValue({ ok: true, json: async () => ({}) });

    const response = await POST(request({ amount: 25 }));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: 'Could not create PayPal wallet top-up order.',
    });
  });

  it('reports a token verification failure as a server error', async () => {
    mocks.verifyIdToken.mockRejectedValue(new Error('bad token'));

    const response = await POST(request({ amount: 25 }));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: 'Internal server error',
    });
  });

  it('reports an unreadable body as a server error', async () => {
    const response = await POST(request('not json'));

    expect(response.status).toBe(500);
  });
});
