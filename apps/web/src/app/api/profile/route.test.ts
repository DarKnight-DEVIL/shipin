import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const mocks = vi.hoisted(() => ({
  extractAuth: vi.fn(),
  verifyIdToken: vi.fn(),
  requireAuthWithProfile: vi.fn(),
  set: vi.fn(),
  update: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  extractAuth: mocks.extractAuth,
  verifyIdToken: mocks.verifyIdToken,
  requireAuthWithProfile: mocks.requireAuthWithProfile,
}));
vi.mock('@/lib/firebaseAdmin', () => ({
  adminDb: {
    collection: vi.fn(() => ({ doc: vi.fn(() => ({ set: mocks.set, update: mocks.update })) })),
  },
}));
vi.mock('firebase-admin/firestore', () => ({
  FieldValue: { serverTimestamp: () => '__SERVER_TS__' },
}));

import { PATCH, POST } from './route';

const request = (body: unknown, method = 'POST') =>
  new NextRequest('http://localhost/api/profile', {
    method,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

beforeEach(() => {
  mocks.extractAuth.mockReset().mockReturnValue('token-1');
  mocks.verifyIdToken.mockReset().mockResolvedValue({ uid: 'user-1', email: 'ada@example.com' });
  mocks.requireAuthWithProfile.mockReset().mockResolvedValue({ profile: { uid: 'user-1' } });
  mocks.set.mockReset().mockResolvedValue(undefined);
  mocks.update.mockReset().mockResolvedValue(undefined);
});

describe('POST /api/profile', () => {
  it('requires a bearer token', async () => {
    mocks.extractAuth.mockReturnValue(null);

    const response = await POST(request({ displayName: 'Ada' }));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ error: 'Authentication required.' });
  });

  it('rejects an invalid token', async () => {
    mocks.verifyIdToken.mockResolvedValue(null);

    const response = await POST(request({ displayName: 'Ada' }));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      error: 'Invalid authentication token.',
    });
  });

  it('rejects an unreadable body', async () => {
    const response = await POST(request('{broken'));

    expect(response.status).toBe(400);
    expect(mocks.set).not.toHaveBeenCalled();
  });

  it('requires a display name', async () => {
    const response = await POST(request({ displayName: '   ' }));

    expect(response.status).toBe(400);
    expect(mocks.set).not.toHaveBeenCalled();
  });

  it('rejects an invalid email', async () => {
    const response = await POST(request({ displayName: 'Ada', email: 'nope' }));

    expect(response.status).toBe(400);
  });

  it('merges the profile using the verified email', async () => {
    const response = await POST(
      request({ displayName: 'Ada', email: 'other@example.com', phone: '+44' })
    );

    expect(mocks.set).toHaveBeenCalledWith(
      {
        displayName: 'Ada',
        email: 'ada@example.com',
        phone: '+44',
        photoURL: '',
        updatedAt: '__SERVER_TS__',
        createdAt: '__SERVER_TS__',
      },
      { merge: true }
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true });
  });
});

describe('PATCH /api/profile', () => {
  it('passes the auth rejection through', async () => {
    mocks.requireAuthWithProfile.mockResolvedValue(
      NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    );

    const response = await PATCH(request({ displayName: 'Ada' }, 'PATCH'));

    expect(response.status).toBe(401);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('rejects an unreadable body', async () => {
    const response = await PATCH(request('{broken', 'PATCH'));

    expect(response.status).toBe(400);
  });

  it('rejects an empty update', async () => {
    const response = await PATCH(request({}, 'PATCH'));

    expect(response.status).toBe(400);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('updates only the supplied fields', async () => {
    const response = await PATCH(request({ displayName: 'Ada L' }, 'PATCH'));

    expect(mocks.update).toHaveBeenCalledWith({
      displayName: 'Ada L',
      updatedAt: '__SERVER_TS__',
    });
    expect(response.status).toBe(200);
  });
});
