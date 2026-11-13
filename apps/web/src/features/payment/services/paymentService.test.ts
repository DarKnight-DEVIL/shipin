import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { paymentService } from './paymentService';

const fetchMock = vi.fn();

const jsonResponse = (body: unknown, ok = true) => ({
  ok,
  json: async () => body,
  text: async () => JSON.stringify(body),
});

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('createPayPalOrder', () => {
  it('returns the order id from the API', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ orderId: 'ORDER-1' }));

    await expect(paymentService.createPayPalOrder('req-1', 100)).resolves.toEqual({
      id: 'ORDER-1',
    });

    expect(fetchMock).toHaveBeenCalledWith('/api/paypal/create-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requestId: 'req-1',
        amount: 100,
        paymentType: 'main',
        additionalItemRequestId: undefined,
      }),
    });
  });

  it('sends the auth token when provided', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ orderId: 'ORDER-1' }));

    await paymentService.createPayPalOrder('req-1', 10, 'additional_item', 'add-1', 'token-1');

    const [, options] = fetchMock.mock.calls[0];
    expect(options.headers).toEqual({
      'Content-Type': 'application/json',
      Authorization: 'Bearer token-1',
    });
    expect(options.body).toContain('"paymentType":"additional_item"');
    expect(options.body).toContain('"additionalItemRequestId":"add-1"');
  });

  it.each([0, -5, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects the amount %d without calling the API',
    async (amount) => {
      await expect(paymentService.createPayPalOrder('req-1', amount)).rejects.toThrow(
        'Invalid PayPal payment amount.'
      );
      expect(fetchMock).not.toHaveBeenCalled();
    }
  );

  it('reports a failed order creation', async () => {
    fetchMock.mockResolvedValue({ ok: false, text: async () => 'paypal down' });

    await expect(paymentService.createPayPalOrder('req-1', 100)).rejects.toThrow(
      'Unable to create PayPal order.'
    );
    expect(console.error).toHaveBeenCalledWith('PayPal create order error:', 'paypal down');
  });

  it('rejects a response without an order id', async () => {
    fetchMock.mockResolvedValue(jsonResponse({}));

    await expect(paymentService.createPayPalOrder('req-1', 100)).rejects.toThrow(
      'PayPal order ID was not returned.'
    );
  });
});

describe('capturePayPalOrder', () => {
  it('returns the capture payload', async () => {
    const payload = { id: 'CAP-1', status: 'COMPLETED', purchase_units: [] };
    fetchMock.mockResolvedValue(jsonResponse(payload));

    await expect(paymentService.capturePayPalOrder('req-1', 'ORDER-1', 100)).resolves.toEqual(
      payload
    );
    expect(fetchMock).toHaveBeenCalledWith('/api/paypal/capture-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requestId: 'req-1',
        orderID: 'ORDER-1',
        amount: 100,
        paymentType: 'main',
        additionalItemRequestId: undefined,
      }),
    });
  });

  it('sends the auth token when provided', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ id: 'CAP-1' }));

    await paymentService.capturePayPalOrder('req-1', 'ORDER-1', 10, 'main', undefined, 'token-1');

    const [, options] = fetchMock.mock.calls[0];
    expect(options.headers.Authorization).toBe('Bearer token-1');
  });

  it.each([0, -1, Number.NaN])('rejects the amount %d', async (amount) => {
    await expect(paymentService.capturePayPalOrder('req-1', 'ORDER-1', amount)).rejects.toThrow(
      'Invalid PayPal payment amount.'
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('surfaces the API error message', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'INSTRUMENT_DECLINED' }),
    });

    await expect(paymentService.capturePayPalOrder('req-1', 'ORDER-1', 100)).rejects.toThrow(
      'INSTRUMENT_DECLINED'
    );
  });

  it('falls back to a generic message for an unparseable error', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      json: async () => {
        throw new Error('not json');
      },
    });

    await expect(paymentService.capturePayPalOrder('req-1', 'ORDER-1', 100)).rejects.toThrow(
      'Unable to capture PayPal payment.'
    );
    expect(console.error).toHaveBeenCalledWith('Unable to parse PayPal capture error.');
  });

  it('ignores an error body without an error field', async () => {
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({}) });

    await expect(paymentService.capturePayPalOrder('req-1', 'ORDER-1', 100)).rejects.toThrow(
      'Unable to capture PayPal payment.'
    );
  });
});
