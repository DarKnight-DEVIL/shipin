import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const mocks = vi.hoisted(() => ({
  requireAuthWithProfile: vi.fn(),
  getRequestById: vi.fn(),
  recordPayment: vi.fn(),
  verifyPayPalOrder: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({ requireAuthWithProfile: mocks.requireAuthWithProfile }));
vi.mock('@/features/requests/services/requests', () => ({
  getRequestById: mocks.getRequestById,
  recordPayment: mocks.recordPayment,
}));
vi.mock('@/lib/paypal', () => ({ verifyPayPalOrder: mocks.verifyPayPalOrder }));

import { POST } from './route';

const request = (body: unknown) =>
  new NextRequest('http://localhost/api/paypal/complete-payment', {
    method: 'POST',
    body: JSON.stringify(body),
  });

const validBody = { requestId: 'req-1', orderID: 'order-1', amount: 100 };

const ownedRequest = {
  userId: 'user-1',
  quote: { breakdown: { grandTotal: 100 } },
};

beforeEach(() => {
  mocks.requireAuthWithProfile.mockReset().mockResolvedValue({
    token: { uid: 'user-1' },
    profile: { uid: 'user-1', role: 'customer' },
  });
  mocks.getRequestById.mockReset().mockResolvedValue(ownedRequest);
  mocks.recordPayment.mockReset().mockResolvedValue(undefined);
  mocks.verifyPayPalOrder.mockReset().mockResolvedValue({
    status: 'COMPLETED',
    purchase_units: [{ payments: { captures: [{ id: 'cap-1', amount: { value: '100.00' } }] } }],
  });
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('POST /api/paypal/complete-payment', () => {
  it('requires authentication', async () => {
    mocks.requireAuthWithProfile.mockResolvedValue(
      NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    );

    const response = await POST(request(validBody));

    expect(response.status).toBe(401);
    expect(mocks.recordPayment).not.toHaveBeenCalled();
  });

  it('rejects an incomplete payload', async () => {
    const response = await POST(request({ requestId: 'req-1' }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'Missing required fields' });
  });

  it('404s for an unknown request', async () => {
    mocks.getRequestById.mockResolvedValue(null);

    const response = await POST(request(validBody));

    expect(response.status).toBe(404);
  });

  it("refuses to touch another customer's request", async () => {
    mocks.getRequestById.mockResolvedValue({ ...ownedRequest, userId: 'someone-else' });

    const response = await POST(request(validBody));

    expect(response.status).toBe(403);
    expect(mocks.recordPayment).not.toHaveBeenCalled();
  });

  it('rejects an amount that does not match the quote', async () => {
    const response = await POST(request({ ...validBody, amount: 50 }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'Amount mismatch' });
  });

  it('rejects an order PayPal has not captured', async () => {
    mocks.verifyPayPalOrder.mockResolvedValue({ status: 'PENDING' });

    const response = await POST(request(validBody));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'Payment has not completed.' });
  });

  it('rejects a completed order with no capture', async () => {
    mocks.verifyPayPalOrder.mockResolvedValue({ status: 'COMPLETED' });

    const response = await POST(request(validBody));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'Capture not found.' });
  });

  it('rejects a capture whose value differs from the claim', async () => {
    mocks.verifyPayPalOrder.mockResolvedValue({
      status: 'COMPLETED',
      purchase_units: [{ payments: { captures: [{ id: 'cap-1', amount: { value: '80.00' } }] } }],
    });

    const response = await POST(request(validBody));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'PayPal amount mismatch.' });
  });

  it('records the payment once everything matches', async () => {
    const response = await POST(request(validBody));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true });
    expect(mocks.recordPayment).toHaveBeenCalledWith('req-1', {
      provider: 'paypal',
      orderId: 'order-1',
      captureId: 'cap-1',
      amount: 100,
    });
  });

  it('tolerates a one-cent rounding difference', async () => {
    mocks.verifyPayPalOrder.mockResolvedValue({
      status: 'COMPLETED',
      purchase_units: [{ payments: { captures: [{ id: 'cap-1', amount: { value: '100.01' } }] } }],
    });

    const response = await POST(request(validBody));

    expect(response.status).toBe(200);
    expect(mocks.recordPayment).toHaveBeenCalled();
  });

  it('reports a malformed body as a server error', async () => {
    const response = await POST(
      new NextRequest('http://localhost/api/paypal/complete-payment', {
        method: 'POST',
        body: 'not json',
      })
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: 'Internal Server Error' });
  });
});
