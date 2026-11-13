/**
 * Vitest unit tests for PayPal webhook verification enforcement.
 *
 * Verifies that verifyPayPalWebhook FAILS CLOSED in production when
 * PAYPAL_WEBHOOK_ID is missing, and that verification failures are
 * never treated as success.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mutable mock state so tests can flip production mode / config per test.
const envState = {
  production: false,
  webhookId: 'test-webhook-id' as string | undefined,
};

vi.mock('@/config/env', () => ({
  get isProduction() {
    return envState.production;
  },
  isDevelopment: true,
  get serverEnv() {
    return {
      PAYPAL_CLIENT_ID: 'test-client-id',
      PAYPAL_CLIENT_SECRET: 'test-secret',
      PAYPAL_ENV: 'sandbox',
      PAYPAL_WEBHOOK_ID: envState.webhookId,
    };
  },
}));

// Mock the errors module
vi.mock('@/utils/errors', () => ({
  createShipINError: (message: string, code: string, status: number) => {
    return Object.assign(new Error(message), { code, status });
  },
}));

import { verifyPayPalWebhook } from '@/lib/paypal';

describe('verifyPayPalWebhook', () => {
  const mockHeaders = new Headers({
    'paypal-auth-algo': 'SHA256withRSA',
    'paypal-cert-url': 'https://www.paypal.com/webapps/checkout/cert',
    'paypal-transmission-id': 'test-transmission-id',
    'paypal-transmission-sig': 'test-sig',
    'paypal-transmission-time': '2026-01-01T00:00:00Z',
  });

  const mockAccessTokenFetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ access_token: 'test-access-token' }),
  });

  beforeEach(() => {
    vi.restoreAllMocks();
    envState.production = false;
    envState.webhookId = 'test-webhook-id';
    // First fetch call = OAuth token, remaining calls = webhook verification
    globalThis.fetch = mockAccessTokenFetch as unknown as typeof fetch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns true when verification_status is SUCCESS', async () => {
    mockAccessTokenFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: 'test-access-token' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ verification_status: 'SUCCESS' }),
      });

    const result = await verifyPayPalWebhook(mockHeaders, '{}');
    expect(result).toBe(true);
  });

  it('returns false when verification_status is FAILURE', async () => {
    mockAccessTokenFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: 'test-access-token' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ verification_status: 'FAILURE' }),
      });

    const result = await verifyPayPalWebhook(mockHeaders, '{}');
    expect(result).toBe(false);
  });

  it('returns false when the verification endpoint returns non-OK (fail closed)', async () => {
    mockAccessTokenFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: 'test-access-token' }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

    const result = await verifyPayPalWebhook(mockHeaders, '{}');
    expect(result).toBe(false);
  });

  it('skips verification and returns true in dev/test when PAYPAL_WEBHOOK_ID is missing', async () => {
    envState.webhookId = undefined;

    const result = await verifyPayPalWebhook(mockHeaders, '{}');
    expect(result).toBe(true);
    // The verification endpoint must NOT have been called — only the
    // OAuth token fetch (or nothing, depending on the code path).
    const verificationCalls = mockAccessTokenFetch.mock.calls.filter(
      ([url]) => String(url).includes('verify-webhook-signature')
    );
    expect(verificationCalls).toHaveLength(0);
  });

  it('FAILS CLOSED in production when PAYPAL_WEBHOOK_ID is missing', async () => {
    envState.production = true;
    envState.webhookId = undefined;

    await expect(verifyPayPalWebhook(mockHeaders, '{}')).rejects.toThrow(
      /PayPal webhook verification is unavailable/
    );

    // The verification endpoint must not have been contacted.
    const verificationCalls = mockAccessTokenFetch.mock.calls.filter(
      ([url]) => String(url).includes('verify-webhook-signature')
    );
    expect(verificationCalls).toHaveLength(0);
  });
});

import { getPayPalBaseUrl, getPayPalAccessToken } from '@/lib/paypal';

describe('getPayPalBaseUrl', () => {
  it('returns sandbox URL for sandbox env', () => {
    expect(getPayPalBaseUrl()).toBe('https://api-m.sandbox.paypal.com');
  });
});

describe('getPayPalAccessToken', () => {
  it('returns access token on successful OAuth', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ access_token: 'token' }) });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const token = await getPayPalAccessToken();
    expect(token).toBe('token');
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/v1/oauth2/token'), expect.objectContaining({ method: 'POST', body: 'grant_type=client_credentials' }));
  });

  it('throws PAYPAL_AUTH_ERROR on failed OAuth response', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({ error: 'invalid_client' }) });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    await expect(getPayPalAccessToken()).rejects.toMatchObject({ code: 'PAYPAL_AUTH_ERROR', status: 502 });
  });

  afterEach(() => vi.restoreAllMocks());
});

import { verifyPayPalOrder, capturePayPalOrder, refundPayPalOrder } from '@/lib/paypal';

describe('verifyPayPalOrder', () => {
  it('returns order data on success', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: 't' }) }).mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'order-1', status: 'APPROVED' }) });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const order = await verifyPayPalOrder('order-1');
    expect(order).toEqual({ id: 'order-1', status: 'APPROVED' });
    const [url] = fetchMock.mock.calls[1] as [string];
    expect(url).toContain('/v2/checkout/orders/order-1');
  });

  it('throws PAYPAL_VERIFY_ERROR on failed lookup', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: 't' }) }).mockResolvedValueOnce({ ok: false, status: 404 });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    await expect(verifyPayPalOrder('missing')).rejects.toMatchObject({ code: 'PAYPAL_VERIFY_ERROR', status: 502 });
  });

  afterEach(() => vi.restoreAllMocks());
});

describe('capturePayPalOrder', () => {
  it('returns capture data on success', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: 't' }) }).mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'capture-1', status: 'COMPLETED' }) });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const capture = await capturePayPalOrder('order-1');
    expect(capture).toEqual({ id: 'capture-1', status: 'COMPLETED' });
    const [url, options] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(url).toContain('/v2/checkout/orders/order-1/capture');
    expect(options.method).toBe('POST');
  });

  it('throws PAYPAL_CAPTURE_ERROR on failed capture', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: 't' }) }).mockResolvedValueOnce({ ok: false, status: 422 });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    await expect(capturePayPalOrder('order-1')).rejects.toMatchObject({ code: 'PAYPAL_CAPTURE_ERROR', status: 502 });
  });

  afterEach(() => vi.restoreAllMocks());
});

describe('refundPayPalOrder', () => {
  it('sends empty body for full refunds', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: 't' }) }).mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'refund-1' }) });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const refund = await refundPayPalOrder('capture-1');
    expect(refund).toEqual({ id: 'refund-1' });
    const [url, options] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(url).toContain('/v1/checkout/sales/capture-1/refund');
    expect(JSON.parse(String(options.body))).toEqual({});
  });

  it('sends USD amount body for partial refunds', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: 't' }) }).mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'refund-2' }) });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    await refundPayPalOrder('capture-1', 10.5);
    const [, options] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(JSON.parse(String(options.body))).toEqual({ amount: { currency_code: 'USD', value: '10.50' } });
  });

  it('throws PAYPAL_REFUND_ERROR on failed refund', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: 't' }) }).mockResolvedValueOnce({ ok: false, status: 400 });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    await expect(refundPayPalOrder('capture-1')).rejects.toMatchObject({ code: 'PAYPAL_REFUND_ERROR', status: 502 });
  });

  afterEach(() => vi.restoreAllMocks());
});
