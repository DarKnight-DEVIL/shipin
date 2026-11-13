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
  new NextRequest('http://localhost/api/requests/req-1/approve-quote', { method: 'POST' });

const inHours = (hours: number) => Timestamp.fromMillis(Date.now() + hours * 3600_000);

const respondWith = (data: Record<string, unknown> | undefined) =>
  mocks.get.mockResolvedValue({ exists: data !== undefined, data: () => data });

const owned = (overrides: Record<string, unknown> = {}) => ({
  userId: 'user-1',
  status: 'awaiting_payment',
  quote: { expiresAt: inHours(12), acceptedAt: null },
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

describe('POST /api/requests/[requestId]/approve-quote', () => {
  it('returns the auth response when unauthenticated', async () => {
    mocks.requireAuthWithProfile.mockResolvedValue(
      NextResponse.json({ success: false }, { status: 401 })
    );

    const response = await POST(post(), context());

    expect(response.status).toBe(401);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('records acceptance without marking the request paid', async () => {
    const response = await POST(post(), context());

    expect(response.status).toBe(200);
    expect(mocks.update).toHaveBeenCalledWith({
      'quote.acceptedAt': '__SERVER_TS__',
      updatedAt: '__SERVER_TS__',
    });
  });

  it('hides another customer\'s request behind a 404', async () => {
    respondWith(owned({ userId: 'someone-else' }));

    const response = await POST(post(), context());

    expect(response.status).toBe(404);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('refuses an expired quote', async () => {
    respondWith(owned({ quote: { expiresAt: inHours(-1), acceptedAt: null } }));

    const response = await POST(post(), context());
    const payload = await response.json();

    expect(response.status).toBe(409);
    expect(payload.code).toBe('QUOTE_EXPIRED');
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('refuses a request with no quote', async () => {
    respondWith(owned({ quote: undefined }));

    const response = await POST(post(), context());

    expect(response.status).toBe(409);
  });

  it('refuses a request that is past the quote decision', async () => {
    respondWith(owned({ status: 'paid' }));

    const response = await POST(post(), context());

    expect(response.status).toBe(409);
  });

  it('treats a repeated acceptance as success without writing again', async () => {
    respondWith(owned({ quote: { expiresAt: inHours(12), acceptedAt: 'already' } }));

    const response = await POST(post(), context());

    expect(response.status).toBe(200);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('returns 404 for an unknown request', async () => {
    respondWith(undefined);

    const response = await POST(post(), context());

    expect(response.status).toBe(404);
  });
});
