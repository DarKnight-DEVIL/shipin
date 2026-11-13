import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const mocks = vi.hoisted(() => ({
  requireAuthWithProfile: vi.fn(),
  topupGet: vi.fn(),
  getPayPalAccessToken: vi.fn(),
  fetch: vi.fn(),
  txGet: vi.fn(),
  txSet: vi.fn(),
  txUpdate: vi.fn(),
  runTransaction: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({ requireAuthWithProfile: mocks.requireAuthWithProfile }));
vi.mock('@/lib/firebaseAdmin', () => ({
  adminDb: {
    collection: (name: string) => ({
      doc: (id?: string) => {
        if (name === 'walletTopupOrders') return { id, __kind: 'topup', get: mocks.topupGet };
        if (name === 'wallets') return { id, __kind: 'wallet' };
        return { id, __kind: 'wtx' };
      },
    }),
    runTransaction: mocks.runTransaction,
  },
}));
vi.mock('@/lib/paypal', () => ({ getPayPalAccessToken: mocks.getPayPalAccessToken }));
vi.mock('@/config/env', () => ({ serverEnv: { PAYPAL_API_URL: 'https://paypal.test' } }));
vi.mock('firebase-admin/firestore', () => ({
  FieldValue: {
    serverTimestamp: () => '__SERVER_TS__',
    increment: (value: number) => `__INC_${value}__`,
  },
}));

import { POST } from './route';

const request = (body: unknown, headers: Record<string, string> = {}) =>
  new NextRequest('http://localhost/api/paypal/capture-wallet-topup', {
    method: 'POST',
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

const snap = (data: Record<string, unknown> | undefined) => ({
  exists: data !== undefined,
  data: () => data,
});

const completedCapture = {
  status: 'COMPLETED',
  purchase_units: [
    { payments: { captures: [{ id: 'cap-1', amount: { value: '25.00', currency_code: 'USD' } }] } },
  ],
};

const body = { orderID: 'order-1', amount: 25 };

beforeEach(() => {
  mocks.requireAuthWithProfile.mockReset().mockResolvedValue({ token: { uid: 'user-1' }, profile: { uid: 'user-1' } });
  mocks.topupGet.mockReset().mockResolvedValue(snap({ userId: 'user-1', amount: 25 }));
  mocks.getPayPalAccessToken.mockReset().mockResolvedValue('access-token');
  mocks.fetch.mockReset().mockResolvedValue({ ok: true, status: 200, json: async () => completedCapture });
  mocks.txGet.mockReset().mockImplementation(async (ref: { __kind?: string }) =>
    ref.__kind === 'wallet' ? snap({ balance: 10, currency: 'USD' }) : snap(undefined)
  );
  mocks.txSet.mockReset();
  mocks.txUpdate.mockReset();
  mocks.runTransaction.mockReset().mockImplementation(async (cb: (tx: unknown) => unknown) =>
    cb({ get: mocks.txGet, set: mocks.txSet, update: mocks.txUpdate })
  );
  vi.stubGlobal('fetch', mocks.fetch);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('POST /api/paypal/capture-wallet-topup', () => {
  it('rejects requests without authentication headers', async () => {
    mocks.requireAuthWithProfile.mockResolvedValue(NextResponse.json(
      { success: false, error: 'Authentication required.', code: 'AUTHENTICATION_REQUIRED' },
      { status: 401 }
    ));
    const response = await POST(request(body, {}));

    expect(response.status).toBe(401);
    expect(mocks.topupGet).not.toHaveBeenCalled();
  });

  it('propagates auth failures from requireAuthWithProfile', async () => {
    mocks.requireAuthWithProfile.mockResolvedValue(NextResponse.json(
      { success: false, error: 'Invalid authentication.', code: 'INVALID_AUTHENTICATION' },
      { status: 401 }
    ));

    const response = await POST(request(body));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      code: 'INVALID_AUTHENTICATION',
    });
  });

  it('requires an order id', async () => {
    const response = await POST(request({ amount: 25 }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: 'PayPal Order ID is required.',
    });
  });

  it('rejects a non-positive or non-numeric amount', async () => {
    const notNumber = await POST(request({ orderID: 'order-1', amount: 'abc' }));
    const zero = await POST(request({ orderID: 'order-1', amount: 0 }));

    expect([notNumber.status, zero.status]).toEqual([400, 400]);
  });

  it('404s for an unknown order', async () => {
    mocks.topupGet.mockResolvedValue(snap(undefined));

    const response = await POST(request(body));

    expect(response.status).toBe(404);
  });

  it("refuses another customer's order", async () => {
    mocks.topupGet.mockResolvedValue(snap({ userId: 'someone-else', amount: 25 }));

    const response = await POST(request(body));

    expect(response.status).toBe(403);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it('rejects an amount that differs from the stored order', async () => {
    const response = await POST(request({ ...body, amount: 40 }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: 'Top-up amount does not match the original order.',
    });
  });

  it('returns a gateway error status on PayPal failure', async () => {
    mocks.fetch.mockResolvedValue({ ok: false, status: 422, json: async () => ({ message: 'Declined' }) });

    const response = await POST(request(body));

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual({ success: false, error: 'Unable to process payment. Please try again.' });
  });

  it('uses a safe fallback when PayPal provides no details', async () => {
    mocks.fetch.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });

    const response = await POST(request(body));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: 'Unable to process payment. Please try again.',
    });
  });

  it('requires a completed PayPal status', async () => {
    mocks.fetch.mockResolvedValue({ ok: true, status: 200, json: async () => ({ status: 'PENDING' }) });

    const response = await POST(request(body));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: 'PayPal payment was not completed.',
    });
  });

  it('requires capture details', async () => {
    mocks.fetch.mockResolvedValue({ ok: true, status: 200, json: async () => ({ status: 'COMPLETED' }) });

    const response = await POST(request(body));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: 'PayPal capture details were not found.',
    });
  });

  it('rejects an invalid capture amount', async () => {
    mocks.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        status: 'COMPLETED',
        purchase_units: [{ payments: { captures: [{ id: 'cap-1', amount: { value: 'nope', currency_code: 'USD' } }] } }],
      }),
    });

    const response = await POST(request(body));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: 'Invalid PayPal capture amount.',
    });
  });

  it('rejects a non-USD capture', async () => {
    mocks.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        status: 'COMPLETED',
        purchase_units: [{ payments: { captures: [{ id: 'cap-1', amount: { value: '25.00', currency_code: 'EUR' } }] } }],
      }),
    });

    const response = await POST(request(body));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: 'Unexpected PayPal payment currency.',
    });
  });

  it('rejects a captured amount that does not match', async () => {
    mocks.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        status: 'COMPLETED',
        purchase_units: [{ payments: { captures: [{ id: 'cap-1', amount: { value: '99.00', currency_code: 'USD' } }] } }],
      }),
    });

    const response = await POST(request(body));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: 'Captured payment amount does not match the wallet top-up.',
    });
  });

  it('increments an existing wallet and records the transaction', async () => {
    const response = await POST(request(body));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      alreadyProcessed: false,
      balance: 35,
      amount: 25,
      currency: 'USD',
      captureId: 'cap-1',
    });
    expect(mocks.txUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ __kind: 'wallet' }),
      expect.objectContaining({ balance: '__INC_25__', currency: 'USD' })
    );
    expect(mocks.txSet).toHaveBeenCalledWith(
      expect.objectContaining({ __kind: 'wtx', id: 'cap-1' }),
      expect.objectContaining({ type: 'deposit', amount: 25, balanceAfter: 35, orderId: 'order-1' })
    );
    expect(mocks.txUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ __kind: 'topup' }),
      expect.objectContaining({ status: 'completed', captureId: 'cap-1' })
    );
  });

  it('creates a wallet when the customer has none', async () => {
    mocks.txGet.mockImplementation(async (ref: { __kind?: string }) =>
      ref.__kind === 'wallet' ? snap(undefined) : snap(undefined)
    );

    const response = await POST(request(body));

    expect(response.status).toBe(200);
    expect(mocks.txSet).toHaveBeenCalledWith(
      expect.objectContaining({ __kind: 'wallet' }),
      expect.objectContaining({ balance: 25, currency: 'USD' })
    );
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({ balance: 25 })
    );
  });

  it('does not double-credit an already processed capture', async () => {
    mocks.txGet.mockImplementation(async (ref: { __kind?: string }) =>
      ref.__kind === 'wallet' ? snap({ balance: 10 }) : snap({ balanceAfter: 35 })
    );

    const response = await POST(request(body));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({ success: true, alreadyProcessed: true, balance: 35 })
    );
    expect(mocks.txSet).not.toHaveBeenCalled();
  });

  it('rejects malformed JSON bodies', async () => {
    const response = await POST(request('not json'));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      code: 'INVALID_JSON',
    });
  });
});
