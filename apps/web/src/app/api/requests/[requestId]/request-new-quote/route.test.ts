import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { Timestamp } from 'firebase/firestore';

const mocks = vi.hoisted(() => ({
  requireAuthWithProfile: vi.fn(),
  get: vi.fn(),
  update: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  requireAuthWithProfile: mocks.requireAuthWithProfile,
}));

vi.mock('@/lib/firebaseAdmin', () => ({
  adminDb: {
    collection: () => ({ doc: () => ({ get: mocks.get, update: mocks.update }) }),
  },
}));

vi.mock('firebase-admin/firestore', () => ({
  FieldValue: { serverTimestamp: () => '__SERVER_TS__' },
}));

import { POST } from './route';

const context = (requestId = 'req-1') => ({ params: Promise.resolve({ requestId }) });

const post = () =>
  new NextRequest('http://localhost/api/requests/req-1/request-new-quote', {
    method: 'POST',
  });

const inHours = (hours: number) => Timestamp.fromMillis(Date.now() + hours * 3600_000);

const respondWith = (data: Record<string, unknown> | undefined) =>
  mocks.get.mockResolvedValue({ exists: data !== undefined, data: () => data });

const owned = (overrides: Record<string, unknown> = {}) => ({
  userId: 'user-1',
  status: 'awaiting_payment',
  quote: { expiresAt: inHours(-2) },
  quoteRegenerationRequested: false,
  ...overrides,
});

beforeEach(() => {
  mocks.requireAuthWithProfile.mockReset().mockResolvedValue({
    token: { uid: 'user-1' },
    profile: { uid: 'user-1', role: 'customer' },
  });
  mocks.update.mockReset().mockResolvedValue(undefined);
  respondWith(owned());
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('POST /api/requests/[requestId]/request-new-quote', () => {
  it('returns the auth response when unauthenticated', async () => {
    mocks.requireAuthWithProfile.mockResolvedValue(
      NextResponse.json({ success: false }, { status: 401 })
    );

    const response = await POST(post(), context());

    expect(response.status).toBe(401);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('returns the request to review and flags the expired quote', async () => {
    const response = await POST(post(), context());

    expect(response.status).toBe(200);

    const update = mocks.update.mock.calls[0][0];
    expect(update.status).toBe('review');
    expect(update.quoteRegenerationRequested).toBe(true);
    expect(update['quote.expired']).toBe(true);
    expect(update['quote.regenerationRequested']).toBe(true);
  });

  it('does not mark a still-valid quote as expired', async () => {
    respondWith(owned({ quote: { expiresAt: inHours(6) } }));

    await POST(post(), context());

    const update = mocks.update.mock.calls[0][0];
    expect(update['quote.expired']).toBeUndefined();
    expect(update['quote.regenerationRequested']).toBe(true);
  });

  it('is idempotent while a regeneration is already pending', async () => {
    respondWith(owned({ quoteRegenerationRequested: true }));

    const response = await POST(post(), context());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.alreadyRequested).toBe(true);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('hides another customer\'s request behind a 404', async () => {
    respondWith(owned({ userId: 'someone-else' }));

    const response = await POST(post(), context());

    expect(response.status).toBe(404);
  });

  it('refuses a request that is already paid', async () => {
    respondWith(owned({ status: 'paid' }));

    const response = await POST(post(), context());

    expect(response.status).toBe(409);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('returns 404 for an unknown request', async () => {
    respondWith(undefined);

    const response = await POST(post(), context());

    expect(response.status).toBe(404);
  });

  it('returns 400 for an invalid request id', async () => {
    const response = await POST(post(), { params: Promise.resolve({ requestId: 'bad id!' }) });

    expect(response.status).toBe(400);
  });
});
