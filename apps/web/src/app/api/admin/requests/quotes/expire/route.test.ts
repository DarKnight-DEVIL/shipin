/**
 * `POST /api/admin/requests/quotes/expire` — cron-driven quote expiry.
 *
 * This endpoint is reachable without Firebase auth, so the shared-secret check
 * is the only thing standing between the public internet and a mass mutation
 * of every open quote. The tests pin that check, then the selection rules.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import crypto from 'crypto';

const mocks = vi.hoisted(() => ({
  collection: vi.fn(),
  createNotification: vi.fn(),
}));

vi.mock('@/lib/firebaseAdmin', () => ({
  adminDb: { collection: mocks.collection },
}));
vi.mock('@/features/notifications/services/server', () => ({
  createNotification: mocks.createNotification,
}));
vi.mock('firebase-admin/firestore', () => ({
  FieldValue: { serverTimestamp: () => '__TS__' },
}));

import { POST } from './route';

const CRON_SECRET = 'cron-secret-value';
const past = new Date(Date.now() - 60_000).toISOString();
const future = new Date(Date.now() + 3_600_000).toISOString();

const request = (authorization?: string) =>
  new NextRequest('http://localhost/api/admin/requests/quotes/expire', {
    method: 'POST',
    headers: authorization ? { authorization } : {},
  });

function quoteDoc(id: string, data: Record<string, unknown>) {
  return {
    id,
    data: () => data,
    ref: { update: vi.fn(async () => undefined) },
  };
}

let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.stubEnv('CRON_SECRET', CRON_SECRET);
  mocks.collection.mockReset();
  mocks.createNotification.mockReset().mockResolvedValue(undefined);
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  errorSpy.mockRestore();
});

describe('POST /api/admin/requests/quotes/expire — authentication', () => {
  it('rejects a request with no bearer token', async () => {
    const response = await POST(request());

    expect(response.status).toBe(401);
    expect((await response.json()).code).toBe('UNAUTHORIZED');
    expect(mocks.collection).not.toHaveBeenCalled();
  });

  it('rejects a wrong token', async () => {
    const response = await POST(request('Bearer not-the-secret'));

    expect(response.status).toBe(401);
    expect(mocks.collection).not.toHaveBeenCalled();
  });

  it('rejects everything when CRON_SECRET is not configured', async () => {
    vi.unstubAllEnvs();
    delete process.env.CRON_SECRET;

    const response = await POST(request('Bearer undefined'));

    // When CRON_SECRET is missing, the endpoint returns 500 (config error)
    // rather than 401 (unauthorized), because the deployment cannot start
    // without this required secret.
    expect(response.status).toBe(500);
    expect((await response.json()).code).toBe('CONFIG_ERROR');
    expect(mocks.collection).not.toHaveBeenCalled();
  });
});

describe('POST /api/admin/requests/quotes/expire — sweep', () => {
  it('expires only quotes that are unexpired and past their deadline', async () => {
    const docs = [
      quoteDoc('r1', { userId: 'u1', quote: { expiresAt: past } }),
      quoteDoc('r2', { userId: 'u2' }),
      quoteDoc('r3', { userId: 'u3', quote: { expiresAt: past, expired: true } }),
      quoteDoc('r4', { userId: 'u4', quote: { expiresAt: past } }),
      quoteDoc('r5', { userId: 'u5', quote: { expiresAt: future } }),
    ];
    mocks.collection.mockReturnValue({ get: vi.fn(async () => ({ docs })) });

    const response = await POST(request(`Bearer ${CRON_SECRET}`));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ success: true, scanned: 5, expired: 2 });

    expect(docs[0].ref.update).toHaveBeenCalledWith(
      expect.objectContaining({ 'quote.expired': true, updatedAt: '__TS__' })
    );
    expect(docs[1].ref.update).not.toHaveBeenCalled();
    expect(docs[2].ref.update).not.toHaveBeenCalled();
    expect(docs[3].ref.update).toHaveBeenCalled();
    expect(docs[4].ref.update).not.toHaveBeenCalled();
  });

  it('notifies the customer for each expired quote', async () => {
    const docs = [quoteDoc('r1', { userId: 'u1', quote: { expiresAt: past } })];
    mocks.collection.mockReturnValue({ get: vi.fn(async () => ({ docs })) });

    await POST(request(`Bearer ${CRON_SECRET}`));

    expect(mocks.createNotification).toHaveBeenCalledWith(
      'u1',
      'r1',
      'Your quote has expired',
      expect.stringContaining('request #r1'),
      'quote'
    );
  });

  it('keeps the expiry when the notification fails', async () => {
    const docs = [quoteDoc('r1', { userId: 'u1', quote: { expiresAt: past } })];
    mocks.collection.mockReturnValue({ get: vi.fn(async () => ({ docs })) });
    mocks.createNotification.mockRejectedValue(new Error('resend down'));

    const response = await POST(request(`Bearer ${CRON_SECRET}`));
    const body = await response.json();

    expect(body.expired).toBe(1);
    expect(docs[0].ref.update).toHaveBeenCalled();
    expect(
      errorSpy.mock.calls.some((call: unknown[]) =>
        String(call[0]).includes('Failed to send quote-expiry notification')
      )
    ).toBe(true);
  });

  it('does not cache the sweep response', async () => {
    mocks.collection.mockReturnValue({ get: vi.fn(async () => ({ docs: [] })) });

    const response = await POST(request(`Bearer ${CRON_SECRET}`));

    expect(response.headers.get('cache-control')).toBe('no-store');
  });
});

describe('POST /api/admin/requests/quotes/expire — signed cron request', () => {
  const sign = (timestamp: string, body = '', secret = CRON_SECRET) =>
    crypto.createHmac('sha256', secret).update(`${timestamp}|${body}`).digest('hex');

  const signedRequest = (headers: Record<string, string>) =>
    new NextRequest('http://localhost/api/admin/requests/quotes/expire', {
      method: 'POST',
      headers,
    });

  it('accepts a fresh timestamp with a valid HMAC signature', async () => {
    const timestamp = String(Date.now());
    mocks.collection.mockReturnValue({ get: vi.fn(async () => ({ docs: [] })) });

    const response = await POST(
      signedRequest({
        'x-cron-timestamp': timestamp,
        'x-cron-signature': sign(timestamp),
      })
    );

    expect(response.status).toBe(200);
    expect((await response.json()).success).toBe(true);
  });

  it('rejects a timestamp older than the replay window', async () => {
    const timestamp = String(Date.now() - 6 * 60 * 1000);

    const response = await POST(
      signedRequest({
        'x-cron-timestamp': timestamp,
        'x-cron-signature': sign(timestamp),
      })
    );

    expect(response.status).toBe(401);
    expect(mocks.collection).not.toHaveBeenCalled();
  });

  it('rejects a timestamp too far in the future', async () => {
    const timestamp = String(Date.now() + 2 * 60 * 1000);

    const response = await POST(
      signedRequest({
        'x-cron-timestamp': timestamp,
        'x-cron-signature': sign(timestamp),
      })
    );

    expect(response.status).toBe(401);
  });

  it('rejects a non-numeric timestamp', async () => {
    const response = await POST(
      signedRequest({
        'x-cron-timestamp': 'not-a-number',
        'x-cron-signature': sign('not-a-number'),
      })
    );

    expect(response.status).toBe(401);
  });

  it('rejects a signature computed with the wrong secret', async () => {
    const timestamp = String(Date.now());

    const response = await POST(
      signedRequest({
        'x-cron-timestamp': timestamp,
        'x-cron-signature': sign(timestamp, '', 'different-secret'),
      })
    );

    expect(response.status).toBe(401);
  });

  it('rejects a malformed signature of the wrong length', async () => {
    const response = await POST(
      signedRequest({
        'x-cron-timestamp': String(Date.now()),
        'x-cron-signature': 'abc',
      })
    );

    expect(response.status).toBe(401);
  });

  it('still falls back to the legacy bearer secret', async () => {
    mocks.collection.mockReturnValue({ get: vi.fn(async () => ({ docs: [] })) });

    const response = await POST(
      signedRequest({ authorization: `Bearer ${CRON_SECRET}` })
    );

    expect(response.status).toBe(200);
  });
});
