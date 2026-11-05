/**
 * PayPal server-side integration — SERVER ONLY.
 *
 * This module MUST NOT be imported in client components.
 * It is imported only by Next.js server-side route handlers (API routes),
 * so process.env is not bundled to the browser.
 *
 * All configuration is centralized in @/config/env (serverEnv).
 */

import { serverEnv } from '@/config/env';
import { createShipINError } from '@/utils/errors';

export function getPayPalBaseUrl(): string {
  if (serverEnv.PAYPAL_API_URL) {
    return serverEnv.PAYPAL_API_URL;
  }
  return serverEnv.PAYPAL_ENV === 'live'
    ? 'https://api-m.paypal.com'
    : 'https://api-m.sandbox.paypal.com';
}

const FETCH_TIMEOUT_MS = 15000;

function fetchWithTimeout(url: string, options: RequestInit = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  return fetch(url, { ...options, signal: controller.signal })
    .finally(() => clearTimeout(timeout));
}

export async function getPayPalAccessToken(): Promise<string> {
  const clientId = serverEnv.PAYPAL_CLIENT_ID;
  const clientSecret = serverEnv.PAYPAL_CLIENT_SECRET;
  const baseUrl = getPayPalBaseUrl();

  if (!clientId || !clientSecret) {
    throw createShipINError(
      'PayPal credentials are not configured.',
      'PAYPAL_CONFIG_ERROR',
      500
    );
  }

  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  const response = await fetchWithTimeout(
    `${baseUrl}/v1/oauth2/token`,
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
      cache: 'no-store',
    }
  );

  const data = await response.json();

  if (!response.ok) {
    console.error('[PayPal] Access token error:', data);
    throw createShipINError(
      'Failed to authenticate with PayPal.',
      'PAYPAL_AUTH_ERROR',
      502
    );
  }

  return data.access_token as string;
}

export async function verifyPayPalOrder(orderID: string): Promise<unknown> {
  const token = await getPayPalAccessToken();
  const baseUrl = getPayPalBaseUrl();

  const response = await fetchWithTimeout(
    `${baseUrl}/v2/checkout/orders/${orderID}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      cache: 'no-store',
    }
  );

  if (!response.ok) {
    throw createShipINError(
      'Unable to verify PayPal order.',
      'PAYPAL_VERIFY_ERROR',
      502
    );
  }

  return response.json();
}

export async function capturePayPalOrder(orderID: string): Promise<unknown> {
  const token = await getPayPalAccessToken();
  const baseUrl = getPayPalBaseUrl();

  const response = await fetchWithTimeout(
    `${baseUrl}/v2/checkout/orders/${orderID}/capture`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    }
  );

  if (!response.ok) {
    throw createShipINError(
      'Unable to capture PayPal payment.',
      'PAYPAL_CAPTURE_ERROR',
      502
    );
  }

  return response.json();
}

export async function refundPayPalOrder(
  captureId: string,
  amount?: number
): Promise<unknown> {
  const token = await getPayPalAccessToken();
  const baseUrl = getPayPalBaseUrl();

  const body: Record<string, unknown> = {};
  if (amount !== undefined) {
    body.amount = {
      currency_code: 'USD',
      value: amount.toFixed(2),
    };
  }

  const response = await fetchWithTimeout(
    `${baseUrl}/v1/checkout/sales/${captureId}/refund`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    }
  );

  if (!response.ok) {
    throw createShipINError(
      'Unable to process PayPal refund.',
      'PAYPAL_REFUND_ERROR',
      502
    );
  }

  return response.json();
}

export async function verifyPayPalWebhook(
  headers: Headers,
  rawBody: string,
  webhookId?: string
): Promise<boolean> {
  const token = await getPayPalAccessToken();
  const baseUrl = getPayPalBaseUrl();
  const id = webhookId ?? serverEnv.PAYPAL_WEBHOOK_ID;

  if (!id) {
    console.warn('[PayPal Webhook] PAYPAL_WEBHOOK_ID not configured, skipping verification');
    return true; // fail-open for local dev
  }

  const response = await fetchWithTimeout(
    `${baseUrl}/v1/notifications/verify-webhook-signature`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        auth_algo: headers.get('paypal-auth-algo'),
        cert_url: headers.get('paypal-cert-url'),
        transmission_id: headers.get('paypal-transmission-id'),
        transmission_sig: headers.get('paypal-transmission-sig'),
        transmission_time: headers.get('paypal-transmission-time'),
        webhook_id: id,
        webhook_event: JSON.parse(rawBody),
      }),
    }
  );

  const data = await response.json();
  return data.verification_status === 'SUCCESS';
}
