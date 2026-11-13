import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  env: { PAYPAL_WEBHOOK_ID: 'WH-1' as string | undefined },
  verifyPayPalWebhook: vi.fn(),
  sendNotification: vi.fn(),
  docs: {} as Record<string, Record<string, unknown> | undefined>,
  txGet: vi.fn(),
  txUpdate: vi.fn(),
  txSet: vi.fn(),
}));

vi.mock('@/config/env', () => ({ serverEnv: mocks.env }));
vi.mock('@/lib/paypal', () => ({ verifyPayPalWebhook: mocks.verifyPayPalWebhook }));
vi.mock('@/features/notifications/services/notificationService', () => ({
  sendNotification: mocks.sendNotification,
}));
vi.mock('firebase-admin/firestore', () => ({
  FieldValue: {
    serverTimestamp: () => '__SERVER_TS__',
    increment: (value: number) => ({ __increment: value }),
  },
}));
vi.mock('@/lib/firebaseAdmin', () => ({
  adminDb: {
    collection: (name: string) => ({
      doc: (id?: string) => {
        const path = `${name}/${id ?? 'generated'}`;
        return {
          path,
          id: id ?? 'generated',
          get: async () => {
            const data = mocks.docs[path];
            return { exists: data !== undefined, data: () => data };
          },
        };
      },
    }),
    runTransaction: async (handler: (tx: unknown) => Promise<unknown>) =>
      handler({ get: mocks.txGet, update: mocks.txUpdate, set: mocks.txSet }),
  },
}));

import { POST } from './route';

const captureEvent = (overrides: Record<string, unknown> = {}) => ({
  event_type: 'PAYMENT.CAPTURE.COMPLETED',
  resource: {
    id: 'CAPTURE-1',
    amount: { value: '104.92', currency_code: 'USD' },
    supplementary_data: { related_ids: { order_id: 'ORDER-1' } },
    ...overrides,
  },
});

const request = (body: unknown) =>
  new NextRequest('http://localhost/api/webhook', {
    method: 'POST',
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

function seedOrder(overrides: Record<string, unknown> = {}) {
  mocks.docs['paypalPaymentOrders/ORDER-1'] = {
    status: 'created',
    paypalAmount: 104.92,
    requestId: 'req-1',
    userId: 'user-1',
    customerName: 'Ada',
    walletApplied: 0,
    ...overrides,
  };
}

beforeEach(() => {
  mocks.env.PAYPAL_WEBHOOK_ID = 'WH-1';
  mocks.docs = {};
  mocks.verifyPayPalWebhook.mockReset().mockResolvedValue(true);
  mocks.sendNotification.mockReset().mockResolvedValue(undefined);
  mocks.txGet.mockReset();
  mocks.txUpdate.mockReset();
  mocks.txSet.mockReset();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('POST /api/webhook', () => {
  it('refuses to run without a configured webhook id', async () => {
    mocks.env.PAYPAL_WEBHOOK_ID = '';
    vi.resetModules();
    const { POST: unconfigured } = await import('./route');

    const response = await unconfigured(request(captureEvent()));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({ code: 'CONFIGURATION_ERROR' });
    expect(mocks.verifyPayPalWebhook).not.toHaveBeenCalled();
  });

  it('rejects an invalid signature', async () => {
    mocks.verifyPayPalWebhook.mockResolvedValue(false);

    const response = await POST(request(captureEvent()));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ code: 'INVALID_SIGNATURE' });
    expect(console.warn).toHaveBeenCalled();
  });

  it('rejects a body that is not JSON', async () => {
    const response = await POST(request('{not json'));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ code: 'INVALID_JSON' });
  });

  it('acknowledges events it does not process', async () => {
    const response = await POST(request({ event_type: 'PAYMENT.CAPTURE.REFUNDED' }));

    expect(response.status).toBe(200);
    expect(mocks.txUpdate).not.toHaveBeenCalled();
  });

  it('acknowledges a capture without an order id', async () => {
    const response = await POST(
      request(captureEvent({ supplementary_data: {}, links: [] }))
    );

    expect(response.status).toBe(200);
    expect(mocks.txUpdate).not.toHaveBeenCalled();
  });

  it('finds the order id from the links when the related id is absent', async () => {
    seedOrder();
    mocks.txGet.mockResolvedValue({
      exists: true,
      data: () => ({ status: 'awaiting_payment', userId: 'user-1' }),
    });

    const response = await POST(
      request(
        captureEvent({
          supplementary_data: {},
          links: [{ rel: 'order', href: 'https://api.paypal.com/orders/ORDER-1' }],
        })
      )
    );

    expect(response.status).toBe(200);
    expect(mocks.txUpdate).toHaveBeenCalled();
  });

  it('ignores an order it never stored', async () => {
    const response = await POST(request(captureEvent()));

    expect(response.status).toBe(200);
    expect(mocks.txUpdate).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalled();
  });

  it('is idempotent for an already completed order', async () => {
    seedOrder({ status: 'completed' });

    await POST(request(captureEvent()));

    expect(mocks.txUpdate).not.toHaveBeenCalled();
  });

  it('ignores a capture whose amount differs from the order', async () => {
    seedOrder();

    await POST(
      request(captureEvent({ amount: { value: '99.00', currency_code: 'USD' } }))
    );

    expect(mocks.txUpdate).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith(
      'PayPal capture amount mismatch:',
      expect.objectContaining({ orderId: 'ORDER-1' })
    );
  });

  it('marks the request paid and notifies the customer', async () => {
    seedOrder();
    mocks.txGet.mockResolvedValue({
      exists: true,
      data: () => ({ status: 'awaiting_payment', userId: 'user-1' }),
    });

    const response = await POST(request(captureEvent()));

    expect(mocks.txUpdate).toHaveBeenCalledTimes(2);
    expect(mocks.txUpdate.mock.calls[0][1]).toMatchObject({
      status: 'paid',
      payment: { orderId: 'ORDER-1', captureId: 'CAPTURE-1', amountPaid: 104.92 },
    });
    expect(mocks.sendNotification).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1', category: 'payment' })
    );
    await expect(response.json()).resolves.toEqual({ received: true, success: true });
  });

  it('debits the wallet when part of the payment came from it', async () => {
    seedOrder({ walletApplied: 20 });
    mocks.txGet
      .mockResolvedValueOnce({ exists: true, data: () => ({ status: 'awaiting_payment', userId: 'user-1' }) })
      .mockResolvedValueOnce({ exists: true, data: () => ({ balance: 50 }) });

    await POST(request(captureEvent()));

    expect(mocks.txUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'wallets/user-1' }),
      { balance: { __increment: -20 }, updatedAt: '__SERVER_TS__' }
    );
    expect(mocks.txSet).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'walletTransactions/generated' }),
      expect.objectContaining({ amount: -20, type: 'payment' })
    );
  });

  it('skips the wallet when it has no document', async () => {
    seedOrder({ walletApplied: 20 });
    mocks.txGet
      .mockResolvedValueOnce({ exists: true, data: () => ({ status: 'awaiting_payment' }) })
      .mockResolvedValueOnce({ exists: false });

    await POST(request(captureEvent()));

    expect(mocks.txSet).not.toHaveBeenCalled();
  });

  it('stops when the request disappeared', async () => {
    seedOrder();
    mocks.txGet.mockResolvedValue({ exists: false });

    await POST(request(captureEvent()));

    expect(mocks.txUpdate).not.toHaveBeenCalled();
  });

  it('stops when the request is already paid', async () => {
    seedOrder();
    mocks.txGet.mockResolvedValue({ exists: true, data: () => ({ status: 'paid' }) });

    await POST(request(captureEvent()));

    expect(mocks.txUpdate).not.toHaveBeenCalled();
  });

  it('keeps a 200 when processing throws so PayPal stops retrying', async () => {
    seedOrder();
    mocks.txGet.mockResolvedValue({
      exists: true,
      data: () => ({ status: 'awaiting_payment' }),
    });
    mocks.txUpdate.mockImplementation(() => {
      throw new Error('transaction aborted');
    });

    const response = await POST(request(captureEvent()));

    expect(response.status).toBe(200);
    expect(console.error).toHaveBeenCalledWith('Webhook processing error:', expect.any(Error));
  });

  it('keeps a 200 when the notification fails', async () => {
    seedOrder();
    mocks.txGet.mockResolvedValue({
      exists: true,
      data: () => ({ status: 'awaiting_payment' }),
    });
    mocks.sendNotification.mockRejectedValue(new Error('mail down'));

    const response = await POST(request(captureEvent()));

    expect(response.status).toBe(200);
    expect(console.error).toHaveBeenCalledWith(
      'Webhook notification failed:',
      expect.any(Error)
    );
  });
});
