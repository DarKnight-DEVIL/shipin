import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  verifyIdToken: vi.fn(),
  get: vi.fn(),
  runTransaction: vi.fn(),
  txGet: vi.fn(),
  txSet: vi.fn(),
  txUpdate: vi.fn(),
  walletGet: vi.fn(),
}));

vi.mock('@/lib/firebaseAdmin', () => ({
  adminAuth: { verifyIdToken: mocks.verifyIdToken },
  adminDb: {
    collection: (name: string) => ({
      doc: (id?: string) => {
        if (name === 'wallets') {
          return { id, __kind: 'wallet', get: mocks.walletGet };
        }
        if (name === 'walletTransactions') {
          return { id: 'wtx-1', __kind: 'walletTransaction' };
        }
        return { id: id ?? 'new-id', __kind: 'request', get: mocks.get };
      },
    }),
    runTransaction: mocks.runTransaction,
  },
}));
vi.mock('@/lib/validation', () => ({
  requestIdSchema: {
    safeParse: (value: { requestId?: string }) =>
      value?.requestId ? { success: true, data: value } : { success: false },
  },
  completePartialRefundBodySchema: 'complete',
  validateBody: (body: { paypalRefundTransactionId?: unknown }, schema: string) =>
    schema === 'complete' &&
    body &&
    (body.paypalRefundTransactionId === undefined ||
      typeof body.paypalRefundTransactionId === 'string')
      ? { success: true, data: body }
      : { success: false },
}));
vi.mock('firebase-admin/firestore', () => ({
  FieldValue: { serverTimestamp: () => '__SERVER_TS__' },
}));

import { POST } from './route';

const context = (requestId = 'req-1') => ({ params: Promise.resolve({ requestId }) });

const request = (body: unknown = { paypalRefundTransactionId: 'tx-1' }, token = 'token-1') =>
  new NextRequest('http://localhost/api/admin/requests/req-1/partial-refund/complete', {
    method: 'POST',
    headers: token ? { authorization: `Bearer ${token}` } : {},
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

const acceptedOffer = {
  status: 'accepted',
  selectedMethod: 'original_payment',
  amount: 50,
  reason: 'Late delivery',
};

const requestDoc = {
  userId: 'user-1',
  payment: { walletAmount: 20, paypalAmount: 100 },
  partialRefundOffer: acceptedOffer,
};

const snapshot = (data: Record<string, unknown> | undefined) => ({
  exists: data !== undefined,
  data: () => data,
});

beforeEach(() => {
  mocks.verifyIdToken.mockReset().mockResolvedValue({ uid: 'admin-1', email: 'a@x.com' });
  mocks.get.mockReset().mockResolvedValue(snapshot(requestDoc));
  mocks.walletGet.mockReset().mockResolvedValue(snapshot({ balance: 10, currency: 'EUR' }));
  mocks.txGet.mockReset().mockImplementation(async (ref: { __kind?: string }) =>
    ref.__kind === 'wallet' ? snapshot({ balance: 10, currency: 'EUR' }) : mocks.get()
  );
  mocks.txSet.mockReset();
  mocks.txUpdate.mockReset();
  mocks.runTransaction.mockReset().mockImplementation(async (cb: (tx: unknown) => unknown) =>
    cb({ get: mocks.txGet, set: mocks.txSet, update: mocks.txUpdate })
  );
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('POST /api/admin/requests/[requestId]/partial-refund/complete', () => {
  it('requires a bearer token', async () => {
    const response = await POST(request(undefined, ''), context());

    expect(response.status).toBe(401);
    expect(mocks.runTransaction).not.toHaveBeenCalled();
  });

  it('rejects an unverifiable token', async () => {
    mocks.verifyIdToken.mockRejectedValue(new Error('bad token'));

    const response = await POST(request(), context());

    expect(response.status).toBe(401);
  });

  it('rejects an invalid request id', async () => {
    const response = await POST(request(), context(''));

    expect(response.status).toBe(400);
  });

  it('rejects an invalid body', async () => {
    const response = await POST(request({ paypalRefundTransactionId: 42 }), context());

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({ code: 'VALIDATION_ERROR' })
    );
  });

  it('404s for an unknown request', async () => {
    mocks.get.mockResolvedValue(snapshot(undefined));

    const response = await POST(request(), context());

    expect(response.status).toBe(404);
  });

  it('requires an offer', async () => {
    mocks.get.mockResolvedValue(snapshot({ payment: { walletAmount: 0, paypalAmount: 0 } }));

    const response = await POST(request(), context());

    expect(response.status).toBe(400);
  });

  it('only processes an accepted offer', async () => {
    mocks.get.mockResolvedValue(
      snapshot({ ...requestDoc, partialRefundOffer: { ...acceptedOffer, status: 'offered' } })
    );

    const response = await POST(request(), context());

    expect(response.status).toBe(400);
    expect(mocks.runTransaction).not.toHaveBeenCalled();
  });

  it('only processes original-payment offers', async () => {
    mocks.get.mockResolvedValue(
      snapshot({
        ...requestDoc,
        partialRefundOffer: { ...acceptedOffer, selectedMethod: 'wallet' },
      })
    );

    const response = await POST(request(), context());

    expect(response.status).toBe(400);
  });

  it('rejects an invalid refund amount', async () => {
    mocks.get.mockResolvedValue(
      snapshot({ ...requestDoc, partialRefundOffer: { ...acceptedOffer, amount: 'abc' } })
    );

    const response = await POST(request(), context());

    expect(response.status).toBe(400);
  });

  it('refuses a refund larger than the original sources', async () => {
    mocks.get.mockResolvedValue(
      snapshot({
        ...requestDoc,
        payment: { walletAmount: 5, paypalAmount: 5 },
        partialRefundOffer: acceptedOffer,
      })
    );

    const response = await POST(request(), context());

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        error: 'The partial refund amount cannot be covered by the original payment sources.',
      })
    );
  });

  it('requires the PayPal transaction id when paypal money is refunded', async () => {
    const response = await POST(request({}), context());

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({ code: 'VALIDATION_ERROR' })
    );
  });

  it('splits the refund across the wallet and PayPal', async () => {
    const response = await POST(request(), context());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      requestId: 'req-1',
      refund: {
        amount: 50,
        walletRefund: 20,
        paypalRefund: 30,
        paypalRefundTransactionId: 'tx-1',
      },
    });

    expect(mocks.txSet).toHaveBeenCalledWith(
      expect.objectContaining({ __kind: 'wallet' }),
      expect.objectContaining({ balance: 30, currency: 'EUR' }),
      { merge: true }
    );
    expect(mocks.txSet).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'wtx-1' }),
      expect.objectContaining({
        userId: 'user-1',
        type: 'refund',
        amount: 20,
        balanceAfter: 30,
        createdBy: 'admin-1',
      })
    );
    expect(mocks.txUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ __kind: 'request' }),
      expect.objectContaining({
        partialRefunds: [
          expect.objectContaining({
            amount: 50,
            walletRefundAmount: 20,
            paypalRefundAmount: 30,
            paypalRefundTransactionId: 'tx-1',
          }),
        ],
        totalRefundedAmount: 50,
        'partialRefundOffer.status': 'completed',
      })
    );
  });

  it('handles a wallet-only refund without a PayPal transaction', async () => {
    mocks.get.mockResolvedValue(
      snapshot({
        ...requestDoc,
        payment: { walletAmount: 40, paypalAmount: 0 },
        partialRefundOffer: { ...acceptedOffer, amount: 20 },
      })
    );

    const response = await POST(request({}), context());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      requestId: 'req-1',
      refund: {
        amount: 20,
        walletRefund: 20,
        paypalRefund: 0,
        paypalRefundTransactionId: null,
      },
    });
    expect(mocks.txUpdate).toHaveBeenCalledWith(
      expect.anything(),
      expect.not.objectContaining({ 'partialRefundOffer.paypalRefundTransactionId': 'tx-1' })
    );
  });

  it('handles a PayPal-only refund without touching the wallet', async () => {
    mocks.get.mockResolvedValue(
      snapshot({
        ...requestDoc,
        payment: { walletAmount: 0, paypalAmount: 100 },
        partialRefundOffer: { ...acceptedOffer, amount: 40 },
      })
    );

    const response = await POST(request(), context());

    expect(response.status).toBe(200);
    expect(mocks.txSet).not.toHaveBeenCalledWith(
      expect.objectContaining({ __kind: 'wallet' }),
      expect.anything(),
      expect.anything()
    );
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        refund: expect.objectContaining({ walletRefund: 0, paypalRefund: 40 }),
      })
    );
  });

  it('reports a transaction that finds the offer already processed', async () => {
    mocks.txGet.mockResolvedValue(
      snapshot({ ...requestDoc, partialRefundOffer: { ...acceptedOffer, status: 'completed' } })
    );

    const response = await POST(request(), context());

    expect(response.status).toBe(500);
    expect(mocks.txUpdate).not.toHaveBeenCalled();
  });

  it('reports a transaction whose request vanished', async () => {
    mocks.txGet.mockResolvedValue(snapshot(undefined));

    const response = await POST(request(), context());

    expect(response.status).toBe(500);
  });

  it('accumulates onto earlier refunds', async () => {
    mocks.get.mockResolvedValue(
      snapshot({
        ...requestDoc,
        totalRefundedAmount: 15,
        partialRefunds: [{ id: 'old', amount: 15 }],
      })
    );

    const response = await POST(request(), context());

    expect(response.status).toBe(200);
    expect(mocks.txUpdate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        partialRefunds: [{ id: 'old', amount: 15 }, expect.objectContaining({ amount: 50 })],
        totalRefundedAmount: 65,
      })
    );
  });
});
