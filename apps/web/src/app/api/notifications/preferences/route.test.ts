import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const mocks = vi.hoisted(() => ({
  requireAuthWithProfile: vi.fn(),
  update: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({ requireAuthWithProfile: mocks.requireAuthWithProfile }));
vi.mock('@/lib/firebaseAdmin', () => ({
  adminDb: {
    collection: vi.fn(() => ({ doc: vi.fn(() => ({ update: mocks.update })) })),
  },
}));
vi.mock('firebase-admin/firestore', () => ({
  FieldValue: { serverTimestamp: () => '__SERVER_TS__' },
}));

import { PATCH } from './route';

const preferences = {
  channels: { inApp: true, email: false, whatsapp: false },
  whatsapp: {},
  categories: {
    quote: true,
    payment: true,
    warehouse: true,
    shipping: true,
    delivery: false,
    support: true,
  },
};

const request = (body: unknown) =>
  new NextRequest('http://localhost/api/notifications/preferences', {
    method: 'PATCH',
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

beforeEach(() => {
  mocks.requireAuthWithProfile.mockReset().mockResolvedValue({ profile: { uid: 'user-1' } });
  mocks.update.mockReset().mockResolvedValue(undefined);
});

describe('PATCH /api/notifications/preferences', () => {
  it('rejects unauthenticated callers', async () => {
    mocks.requireAuthWithProfile.mockResolvedValue(
      NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    );

    const response = await PATCH(request(preferences));

    expect(response.status).toBe(401);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('rejects an unreadable body', async () => {
    const response = await PATCH(request('{broken'));

    expect(response.status).toBe(400);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('rejects preferences that fail validation', async () => {
    const response = await PATCH(request({ channels: { inApp: true } }));

    expect(response.status).toBe(400);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('stores the validated preferences', async () => {
    const response = await PATCH(request(preferences));

    expect(mocks.update).toHaveBeenCalledWith({
      'preferences.notifications': {
        ...preferences,
        whatsapp: { phone: '' },
      },
      preferencesUpdatedAt: '__SERVER_TS__',
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true });
  });

  it('keeps a supplied WhatsApp number', async () => {
    await PATCH(
      request({
        ...preferences,
        whatsapp: { phone: '+919876543210', consentedAt: '2026-01-01T00:00:00.000Z' },
      })
    );

    expect(mocks.update.mock.calls[0][0]['preferences.notifications'].whatsapp).toEqual({
      phone: '+919876543210',
      consentedAt: '2026-01-01T00:00:00.000Z',
    });
  });
});
