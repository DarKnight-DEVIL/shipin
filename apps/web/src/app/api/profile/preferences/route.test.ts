import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const mocks = vi.hoisted(() => ({
  requireAuthWithProfile: vi.fn(),
  set: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({ requireAuthWithProfile: mocks.requireAuthWithProfile }));
vi.mock('@/lib/firebaseAdmin', () => ({
  adminDb: {
    collection: vi.fn(() => ({ doc: vi.fn(() => ({ set: mocks.set })) })),
  },
}));
vi.mock('firebase-admin/firestore', () => ({
  FieldValue: { serverTimestamp: () => '__SERVER_TS__' },
}));

import { PATCH } from './route';

const request = (body: unknown) =>
  new NextRequest('http://localhost/api/profile/preferences', {
    method: 'PATCH',
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

beforeEach(() => {
  mocks.requireAuthWithProfile.mockReset().mockResolvedValue({ profile: { uid: 'user-1' } });
  mocks.set.mockReset().mockResolvedValue(undefined);
});

describe('PATCH /api/profile/preferences', () => {
  it('rejects unauthenticated callers', async () => {
    mocks.requireAuthWithProfile.mockResolvedValue(
      NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    );

    const response = await PATCH(request({ metrics: ['active', 'paid', 'shipped', 'packed'] }));

    expect(response.status).toBe(401);
    expect(mocks.set).not.toHaveBeenCalled();
  });

  it('rejects an unreadable body', async () => {
    const response = await PATCH(request('{nope'));

    expect(response.status).toBe(400);
  });

  it('enforces the four-card minimum', async () => {
    const response = await PATCH(request({ metrics: ['active', 'paid'] }));

    expect(response.status).toBe(400);
    expect(mocks.set).not.toHaveBeenCalled();
  });

  it('rejects unknown metric ids', async () => {
    const response = await PATCH(
      request({ metrics: ['active', 'paid', 'shipped', 'not-a-metric'] })
    );

    expect(response.status).toBe(400);
  });

  it('merges the selection into the user document', async () => {
    const metrics = ['active', 'paid', 'shipped', 'packed'];

    const response = await PATCH(request({ metrics }));

    expect(mocks.set).toHaveBeenCalledWith(
      {
        preferences: { dashboardMetrics: metrics },
        preferencesUpdatedAt: '__SERVER_TS__',
      },
      { merge: true }
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true });
  });
});
