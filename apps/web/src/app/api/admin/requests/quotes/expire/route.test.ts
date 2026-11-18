/**
 * `POST /api/admin/requests/quotes/expire` — cron-driven quote expiry.
 *
 * This endpoint is reachable without Firebase auth, so the shared-secret check
 * is the only thing standing between the public internet and a mass mutation
 * of every open quote. The tests pin that check, then the selection rules.
 *
 * The sweep no longer reads the whole `requests` collection: it runs one
 * bounded, indexed range query. The fake below records the constraints the query
 * was built with, so the tests can pin both "which rows are selected" and "how
 * much work a single run may do".
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

/** Mirrors SWEEP_LIMIT in the route. */
const SWEEP_LIMIT = 200;

/**
 * The endpoint accepts only signed cron requests: a timestamp header plus an
 * HMAC over `${timestamp}|${body}`. There is no bare `Bearer` path, so every
 * authenticated test signs its request the way the scheduled workflow does.
 */
const signCronRequest = (timestamp: string, body = '', secret = CRON_SECRET) =>
  crypto.createHmac('sha256', secret).update(`${timestamp}|${body}`).digest('hex');

const signedCronRequest = (secret: string = CRON_SECRET, timestamp = String(Date.now())) =>
  new NextRequest('http://localhost/api/admin/requests/quotes/expire', {
    method: 'POST',
    headers: {
      'x-cron-timestamp': timestamp,
      'x-cron-signature': signCronRequest(timestamp, '', secret),
    },
  });

/** A request carrying no cron credentials at all. */
const bareRequest = () =>
  new NextRequest('http://localhost/api/admin/requests/quotes/expire', { method: 'POST' });

type QuoteDoc = ReturnType<typeof quoteDoc>;

function quoteDoc(id: string, data: Record<string, unknown>) {
  return {
    id,
    data: () => data,
    ref: { update: vi.fn(async () => undefined) },
  };
}

interface FakeQuery {
  where: (field: string, op: string, value: unknown) => FakeQuery;
  orderBy: (field: string, direction: string) => FakeQuery;
  limit: (size: number) => FakeQuery;
  get: () => Promise<{ docs: QuoteDoc[]; size: number }>;
}

/** What the route asked Firestore for, per test. */
const queryCalls = {
  where: [] as Array<[string, string, unknown]>,
  orderBy: [] as Array<[string, string]>,
  limit: [] as number[],
  reads: 0,
};

/**
 * Fake the single query the sweep builds. One run performs exactly one read:
 * there is no cursor, because marking a row expired removes it from the result
 * set and the next hourly run starts from the new head.
 */
function mockRequestQuery(docs: QuoteDoc[]) {
  queryCalls.where = [];
  queryCalls.orderBy = [];
  queryCalls.limit = [];
  queryCalls.reads = 0;

  const query: FakeQuery = {
    where: (field, op, value) => {
      queryCalls.where.push([field, op, value]);
      return query;
    },
    orderBy: (field, direction) => {
      queryCalls.orderBy.push([field, direction]);
      return query;
    },
    limit: (size) => {
      queryCalls.limit.push(size);
      return query;
    },
    get: async () => {
      queryCalls.reads += 1;
      return { docs, size: docs.length };
    },
  };

  mocks.collection.mockReturnValue(query);
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
  it('rejects a request with no cron credentials', async () => {
    const response = await POST(bareRequest());

    expect(response.status).toBe(401);
    expect((await response.json()).code).toBe('UNAUTHORIZED');
    expect(mocks.collection).not.toHaveBeenCalled();
  });

  it('rejects a signature made with a different secret', async () => {
    const response = await POST(signedCronRequest('not-the-secret'));

    expect(response.status).toBe(401);
    expect(mocks.collection).not.toHaveBeenCalled();
  });

  it('rejects everything when CRON_SECRET is not configured', async () => {
    vi.unstubAllEnvs();
    delete process.env.CRON_SECRET;

    const response = await POST(signedCronRequest('undefined'));

    // When CRON_SECRET is missing, the endpoint returns 500 (config error)
    // rather than 401 (unauthorized), because the deployment cannot start
    // without this required secret.
    expect(response.status).toBe(500);
    expect((await response.json()).code).toBe('CONFIG_ERROR');
    expect(mocks.collection).not.toHaveBeenCalled();
  });
});

describe('POST /api/admin/requests/quotes/expire — query shape', () => {
  it('selects only unexpired quotes past their deadline, oldest first', async () => {
    mockRequestQuery([]);

    await POST(signedCronRequest());

    // An equality filter on the flag we mutate (so processed rows leave the
    // result set) plus a range on the deadline. This is what makes the sweep
    // cost proportional to expired quotes rather than to request history.
    expect(queryCalls.where).toEqual([
      ['quote.expired', '==', false],
      ['quote.expiresAt', '<=', expect.any(Date)],
    ]);
    expect(queryCalls.orderBy).toEqual([['quote.expiresAt', 'asc']]);
    expect(queryCalls.limit).toEqual([SWEEP_LIMIT]);
  });

  it('reads exactly one bounded page per run', async () => {
    mockRequestQuery(
      Array.from({ length: SWEEP_LIMIT }, (_, index) =>
        quoteDoc(`r${index}`, { userId: 'u', quote: { expiresAt: past } })
      )
    );

    const body = await (await POST(signedCronRequest())).json();

    expect(queryCalls.reads).toBe(1);
    expect(body).toMatchObject({ scanned: SWEEP_LIMIT, expired: SWEEP_LIMIT });
  });

  it('reads nothing when no quote has expired', async () => {
    mockRequestQuery([]);

    const body = await (await POST(signedCronRequest())).json();

    expect(body).toMatchObject({ scanned: 0, expired: 0 });
    expect(queryCalls.reads).toBe(1);
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
    mockRequestQuery(docs);

    const response = await POST(signedCronRequest());
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
    mockRequestQuery([quoteDoc('r1', { userId: 'u1', quote: { expiresAt: past } })]);

    await POST(signedCronRequest());

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
    mockRequestQuery(docs);
    mocks.createNotification.mockRejectedValue(new Error('resend down'));

    const response = await POST(signedCronRequest());
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
    mockRequestQuery([]);

    const response = await POST(signedCronRequest());

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
    mockRequestQuery([]);

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

  it('accepts a fresh timestamp with a valid HMAC signature', async () => {
    const timestamp = String(Date.now());
    mockRequestQuery([]);

    const response = await POST(
      signedRequest({
        'x-cron-timestamp': timestamp,
        'x-cron-signature': sign(timestamp),
      })
    );

    expect(response.status).toBe(200);
    expect((await response.json()).success).toBe(true);
  });
});
