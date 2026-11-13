/**
 * PayPal server-side integration — SERVER ONLY.
 *
 * This module MUST NOT be imported in client components.
 * It is imported only by Next.js server-side route handlers (API routes),
 * so process.env is not bundled to the browser.
 *
 * All configuration is centralized in @/config/env (serverEnv).
 */

import { serverEnv, isProduction } from '@/config/env';
import { createShipINError } from '@/utils/errors';
import { fetchWithTimeout } from '@/lib/http';
import { childLogger } from '@/lib/logger';

const paypalLog = childLogger({ service: "paypal" });

export function getPayPalBaseUrl(): string {
  if (serverEnv.PAYPAL_API_URL) {
    return serverEnv.PAYPAL_API_URL;
  }
  return serverEnv.PAYPAL_ENV === 'live'
    ? 'https://api-m.paypal.com'
    : 'https://api-m.sandbox.paypal.com';
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
    paypalLog.error('Access token error', { status: response.status });
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
    // FAIL CLOSED in production: an unverifiable webhook must never be
    // accepted as legitimate. In dev/test we skip verification so local
    // testing without a PayPal webhook registration still works.
    if (isProduction) {
      paypalLog.error('FATAL: PAYPAL_WEBHOOK_ID is not configured')
      throw createShipINError(
        'PayPal webhook verification is unavailable.',
        'PAYPAL_WEBHOOK_CONFIG_ERROR',
        500
      );
    }
    paypalLog.warn('PAYPAL_WEBHOOK_ID missing, skipping verification (dev/test only)');
    return true;
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

  // FAIL CLOSED: if PayPal's verification endpoint errors out (network
  // blip, non-JSON response), we must not treat the webhook as valid.
  if (!response.ok) {
    paypalLog.error('Verification endpoint returned non-OK status', { status: response.status });
    return false;
  }

  const data = await response.json();
  return data.verification_status === 'SUCCESS';
}
