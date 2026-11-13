import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const mocks = vi.hoisted(() => ({
  requireAuthWithProfile: vi.fn(),
  requestGet: vi.fn(),
  requestUpdate: vi.fn(),
  orderGet: vi.fn(),
  orderUpdate: vi.fn(),
  txGet: vi.fn(),
  txSet: vi.fn(),
  txUpdate: vi.fn(),
  runTransaction: vi.fn(),
  sendNotification: vi.fn(),
  getPayPalAccessToken: vi.fn(),
  fetch: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({ requireAuthWithProfile: mocks.requireAuthWithProfile }));
vi.mock('@/lib/firebaseAdmin', () => ({
  adminDb: {
    collection: (name: string) => ({
      doc: (id?: string) => {
        if (name === 'requests') return { id, get: mocks.requestGet, update: mocks.requestUpdate };
        if (name === 'wallets') return { id, __kind: 'wallet' };
        if (name === 'walletTransactions') return { id, __kind: 'wtx' };
        return { id, __kind: 'order', get: mocks.orderGet, update: mocks.orderUpdate };
      },
    }),
    runTransaction: mocks.runTransaction,
  },
}));
vi.mock('@/lib/paypal', () => ({ getPayPalAccessToken: mocks.getPayPalAccessToken }));
vi.mock('@/config/env', () => ({ serverEnv: { PAYPAL_API_URL: 'https://paypal.test' } }));
vi.mock('@/features/notifications/services/notificationService', () => ({
  sendNotification: mocks.sendNotification,
}));
vi.mock('firebase-admin/firestore', () => ({
  FieldValue: {
    serverTimestamp: () => '__SERVER_TS__',
    arrayUnion: (value: unknown) => ({ __UNION: value }),
  },
  Timestamp: { now: () => 0 },
}));

import { POST } from './route';

const request = (body: unknown) =>
  new NextRequest('http://localhost/api/paypal/capture-order', {
    method: 'POST',
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

const snap = (data: Record<string, unknown> | undefined) => ({
  exists: data !== undefined,
  data: () => data,
});

const requestDoc = {
  userId: 'user-1',
  customerName: 'Ada',
  additionalItemRequests: [],
};

const mainOrder = {
  requestId: 'req-1',
  userId: 'user-1',
  paymentType: 'main',
  additionalItemRequestId: null,
  baseAmount: 100,
  totalRequired: 104.7,
  walletApplied: 20,
  paypalAmount: 84.7,
  status: 'created',
};

const body = { requestId: 'req-1', orderID: 'order-1', amount: 84.7 };

const captureOk = {
  status: 'COMPLETED',
  purchase_units: [
    { payments: { captures: [{ id: 'cap-1', amount: { value: '84.70', currency_code: 'USD' } }] } },
  ],
};

beforeEach(() => {
  mocks.requireAuthWithProfile.mockReset().mockResolvedValue({
    token: { uid: 'user-1' },
    profile: { uid: 'user-1', role: 'customer' },
  });
  mocks.requestGet.mockReset().mockResolvedValue(snap(requestDoc));
  mocks.requestUpdate.mockReset().mockResolvedValue(undefined);
  mocks.orderGet.mockReset().mockResolvedValue(snap(mainOrder));
  mocks.orderUpdate.mockReset().mockResolvedValue(undefined);
  mocks.txGet.mockReset().mockImplementation(async (ref: { __kind?: string }) => {
    if (ref.__kind === 'wallet') return snap({ balance: 50, currency: 'USD' });
    if (ref.__kind === 'order') return snap(mainOrder);
    return snap(requestDoc);
  });
  mocks.txSet.mockReset();
  mocks.txUpdate.mockReset();
  mocks.runTransaction.mockReset().mockImplementation(async (cb: (tx: unknown) => unknown) =>
    cb({ get: mocks.txGet, set: mocks.txSet, update: mocks.txUpdate })
  );
  mocks.sendNotification.mockReset().mockResolvedValue(undefined);
  mocks.getPayPalAccessToken.mockReset().mockResolvedValue('access-token');
  mocks.fetch.mockReset().mockResolvedValue({ ok: true, status: 200, json: async () => captureOk });
  vi.stubGlobal('fetch', mocks.fetch);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('POST /api/paypal/capture-order', () => {
  it('requires authentication', async () => {
    mocks.requireAuthWithProfile.mockResolvedValue(
      NextResponse.json({ success: false }, { status: 401 })
    );

    const response = await POST(request(body));

    expect(response.status).toBe(401);
    expect(mocks.requestGet).not.toHaveBeenCalled();
  });

  it('validates the payload', async () => {
    const noRequest = await POST(request({ orderID: 'order-1', amount: 84.7 }));
    const noOrder = await POST(request({ requestId: 'req-1', amount: 84.7 }));
    const badAmount = await POST(request({ ...body, amount: -1 }));
    const badType = await POST(request({ ...body, paymentType: 'barter' }));
    const noItem = await POST(request({ ...body, paymentType: 'additional_item' }));

    expect(
      [noRequest, noOrder, badAmount, badType, noItem].map((response) => response.status)
    ).toEqual([400, 400, 400, 400, 400]);
    await expect(noItem.json()).resolves.toEqual({
      success: false,
      error: 'Additional item request ID is required.',
    });
  });

  it('404s for an unknown request or missing data', async () => {
    mocks.requestGet.mockResolvedValueOnce(snap(undefined));
    const missing = await POST(request(body));

    mocks.requestGet.mockResolvedValueOnce(snap({}));
    const noData = await POST(request({ ...body, requestId: 'req-2' }));

    expect([missing.status, noData.status]).toEqual([404, 403]);
  });

  it('404s for an unknown request document', async () => {
    mocks.requestGet.mockResolvedValue(snap(undefined));

    const response = await POST(request(body));

    expect(response.status).toBe(404);
  });

  it('403s when our payment order is missing', async () => {
    mocks.orderGet.mockResolvedValue(snap(undefined));

    const response = await POST(request(body));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: 'PayPal payment order could not be verified.',
    });
  });

  it('403s when our payment order has no data', async () => {
    mocks.orderGet.mockResolvedValue(snap({}));

    const response = await POST(request({ ...body, requestId: 'req-1' }));

    expect(response.status).toBe(403);
  });

  it('403s when the order belongs to another request', async () => {
    mocks.orderGet.mockResolvedValue(snap({ ...mainOrder, requestId: 'req-9' }));

    const response = await POST(request(body));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: 'This payment does not belong to the requested order.',
    });
  });

  it('403s on a payment type mismatch', async () => {
    mocks.orderGet.mockResolvedValue(snap({ ...mainOrder, paymentType: 'additional_item' }));

    const response = await POST(request(body));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: 'Payment type does not match the PayPal order.',
    });
  });

  it('403s on an additional item mismatch', async () => {
    mocks.orderGet.mockResolvedValue(
      snap({ ...mainOrder, additionalItemRequestId: 'other-item' })
    );

    const response = await POST(request(body));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: 'Additional item payment does not match the PayPal order.',
    });
  });

  it("403s when the order belongs to another account", async () => {
    mocks.orderGet.mockResolvedValue(snap({ ...mainOrder, userId: 'someone-else' }));

    const response = await POST(request(body));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: 'This payment does not belong to the authenticated account.',
    });
  });

  it('is idempotent for an already completed payment', async () => {
    mocks.orderGet.mockResolvedValue(snap({ ...mainOrder, status: 'completed', captureId: 'cap-0' }));

    const response = await POST(request(body));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      alreadyCompleted: true,
      paymentType: 'main',
      captureId: 'cap-0',
    });
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it('rejects a client amount the order does not match', async () => {
    const response = await POST(request({ ...body, amount: 10 }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: 'The PayPal payment amount could not be verified.',
    });
  });

  it('reports a PayPal capture failure', async () => {
    mocks.fetch.mockResolvedValue({ ok: false, status: 500, json: async () => ({ debug_id: 'x' }) });

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
  });

  it('requires capture details and an id', async () => {
    mocks.fetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ status: 'COMPLETED' }) });
    const noCapture = await POST(request(body));

    mocks.fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        status: 'COMPLETED',
        purchase_units: [{ payments: { captures: [{ id: '', amount: { value: '84.70', currency_code: 'USD' } }] } }],
      }),
    });
    const noId = await POST(request(body));

    expect([noCapture.status, noId.status]).toEqual([400, 400]);
  });

  it('validates the captured amount and currency', async () => {
    mocks.fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        status: 'COMPLETED',
        purchase_units: [{ payments: { captures: [{ id: 'cap-1', amount: { value: '0', currency_code: 'USD' } }] } }],
      }),
    });
    const badAmount = await POST(request(body));

    mocks.fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        status: 'COMPLETED',
        purchase_units: [{ payments: { captures: [{ id: 'cap-1', amount: { value: '84.70', currency_code: 'EUR' } }] } }],
      }),
    });
    const badCurrency = await POST(request(body));

    expect([badAmount.status, badCurrency.status]).toEqual([400, 400]);
    await expect(badCurrency.json()).resolves.toEqual({
      success: false,
      error: 'Unexpected PayPal payment currency.',
    });
  });

  it('rejects a captured amount that differs from the order', async () => {
    mocks.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        status: 'COMPLETED',
        purchase_units: [{ payments: { captures: [{ id: 'cap-1', amount: { value: '50.00', currency_code: 'USD' } }] } }],
      }),
    });

    const response = await POST(request(body));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: 'Captured payment amount does not match the expected PayPal payment.',
    });
  });

  it('rejects a stored calculation that does not add up', async () => {
    mocks.orderGet.mockResolvedValue(snap({ ...mainOrder, totalRequired: 0 }));

    const response = await POST(request(body));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: 'The stored payment calculation is invalid.',
    });
  });

  it('rejects a wallet amount that does not reconcile', async () => {
    mocks.orderGet.mockResolvedValue(snap({ ...mainOrder, walletApplied: 40, totalRequired: 104.7 }));

    const response = await POST(request({ ...body, amount: 84.7 }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: 'The stored payment calculation could not be verified.',
    });
  });

  it('deducts the wallet and marks the request paid', async () => {
    const response = await POST(request(body));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      paymentType: 'main',
      captureId: 'cap-1',
      paymentMethod: 'wallet_and_paypal',
      paypalAmount: 84.7,
      walletAmount: 20,
      totalAmount: 104.7,
    });
    expect(mocks.txSet).toHaveBeenCalledWith(
      expect.objectContaining({ __kind: 'wallet' }),
      expect.objectContaining({ balance: 30 }),
      { merge: true }
    );
    expect(mocks.txSet).toHaveBeenCalledWith(
      expect.objectContaining({ __kind: 'wtx', id: 'paypal_cap-1' }),
      expect.objectContaining({ type: 'payment', amount: -20, balanceAfter: 30 })
    );
    expect(mocks.txUpdate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        status: 'paid',
        payment: expect.objectContaining({
          paymentMethod: 'wallet_and_paypal',
          walletAmount: 20,
          paypalAmount: 84.7,
        }),
      })
    );
    expect(mocks.sendNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        requestId: 'req-1',
        category: 'payment',
        whatsapp: expect.objectContaining({ templateName: 'shipin_payment_received' }),
      })
    );
  });

  it('keeps the payment when the notification fails', async () => {
    mocks.sendNotification.mockRejectedValue(new Error('mail down'));

    const response = await POST(request(body));

    expect(response.status).toBe(200);
    expect(console.error).toHaveBeenCalledWith(
      'Payment notification failed:',
      expect.any(Error)
    );
  });

  it('handles a PayPal-only payment', async () => {
    mocks.orderGet.mockResolvedValue(
      snap({ ...mainOrder, walletApplied: 0, paypalAmount: 104.7 })
    );
    mocks.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        status: 'COMPLETED',
        purchase_units: [
          { payments: { captures: [{ id: 'cap-1', amount: { value: '104.70', currency_code: 'USD' } }] } },
        ],
      }),
    });

    const response = await POST(request({ ...body, amount: 104.7 }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({ paymentMethod: 'paypal', walletAmount: 0 })
    );
    expect(mocks.txSet).not.toHaveBeenCalledWith(
      expect.objectContaining({ __kind: 'wallet' }),
      expect.anything(),
      expect.anything()
    );
  });

  it('stops when the wallet no longer covers the payment', async () => {
    mocks.txGet.mockImplementation(async (ref: { __kind?: string }) => {
      if (ref.__kind === 'wallet') return snap({ balance: 5 });
      if (ref.__kind === 'order') return snap(mainOrder);
      return snap(requestDoc);
    });

    const response = await POST(request(body));

    expect(response.status).toBe(500);
    expect(mocks.txUpdate).not.toHaveBeenCalled();
  });

  it('skips the transaction when another request completed the order', async () => {
    mocks.txGet.mockImplementation(async (ref: { __kind?: string }) => {
      if (ref.__kind === 'wallet') return snap({ balance: 50 });
      if (ref.__kind === 'order') return snap({ ...mainOrder, status: 'completed' });
      return snap(requestDoc);
    });

    const response = await POST(request(body));

    expect(response.status).toBe(200);
    expect(mocks.txUpdate).not.toHaveBeenCalled();
  });

  it('fails when the order disappears inside the transaction', async () => {
    mocks.txGet.mockImplementation(async (ref: { __kind?: string }) => {
      if (ref.__kind === 'wallet') return snap({ balance: 50 });
      if (ref.__kind === 'order') return snap(undefined);
      return snap(requestDoc);
    });

    const response = await POST(request(body));

    expect(response.status).toBe(500);
  });

  describe('additional item payments', () => {
    const itemOrder = {
      ...mainOrder,
      paymentType: 'additional_item',
      additionalItemRequestId: 'item-1',
      baseAmount: 50,
      totalRequired: 52.5,
      walletApplied: 0,
      paypalAmount: 52.5,
    };

    const itemDoc = {
      ...requestDoc,
      additionalItemRequests: [
        {
          id: 'item-1',
          status: 'awaiting_payment',
          totalDue: 50,
          item: { name: 'Extra', url: '', quantity: 1 },
          unitPrice: 50,
          subtotal: 50,
        },
      ],
    };

    const itemBody = {
      requestId: 'req-1',
      orderID: 'order-1',
      amount: 52.5,
      paymentType: 'additional_item',
      additionalItemRequestId: 'item-1',
    };

    const itemCapture = {
      status: 'COMPLETED',
      purchase_units: [
        { payments: { captures: [{ id: 'cap-2', amount: { value: '52.50', currency_code: 'USD' } }] } },
      ],
    };

    beforeEach(() => {
      mocks.orderGet.mockResolvedValue(snap(itemOrder));
      mocks.requestGet.mockResolvedValue(snap(itemDoc));
      mocks.fetch.mockResolvedValue({ ok: true, status: 200, json: async () => itemCapture });
    });

    it('marks the item paid and records the payment', async () => {
      const response = await POST(request(itemBody));

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({
        success: true,
        paymentType: 'additional_item',
        additionalItemRequestId: 'item-1',
        captureId: 'cap-2',
        amountPaid: 52.5,
        paymentMethod: 'paypal',
      });
      expect(mocks.requestUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          additionalItemRequests: [
            expect.objectContaining({ id: 'item-1', status: 'paid', amountPaid: 52.5 }),
          ],
          additionalPayments: expect.objectContaining({
            __UNION: expect.objectContaining({ captureId: 'cap-2', status: 'completed' }),
          }),
        })
      );
      expect(mocks.orderUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'completed', captureId: 'cap-2' })
      );
      expect(mocks.runTransaction).not.toHaveBeenCalled();
    });

    it('404s when the item no longer exists', async () => {
      mocks.requestGet.mockResolvedValue(snap({ ...requestDoc, additionalItemRequests: [] }));

      const response = await POST(request(itemBody));

      expect(response.status).toBe(404);
      await expect(response.json()).resolves.toEqual({
        success: false,
        error: 'Additional item request could not be found.',
      });
    });

    it('rejects an item that is not awaiting payment', async () => {
      mocks.requestGet.mockResolvedValue(
        snap({ ...requestDoc, additionalItemRequests: [{ id: 'item-1', status: 'paid', totalDue: 50 }] })
      );

      const response = await POST(request(itemBody));

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({
        success: false,
        error: 'This additional item is not awaiting payment.',
      });
    });

    it('rejects an item whose amount changed', async () => {
      mocks.requestGet.mockResolvedValue(
        snap({
          ...requestDoc,
          additionalItemRequests: [{ id: 'item-1', status: 'awaiting_payment', totalDue: 60 }],
        })
      );

      const response = await POST(request(itemBody));

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({
        success: false,
        error: 'The additional item payment amount could not be verified.',
      });
    });
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
