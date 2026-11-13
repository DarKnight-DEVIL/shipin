import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const mocks = vi.hoisted(() => ({
  requireAuthWithProfile: vi.fn(),
  get: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({ requireAuthWithProfile: mocks.requireAuthWithProfile }));
vi.mock('@/lib/firebaseAdmin', () => ({
  adminDb: {
    collection: vi.fn(() => ({
      doc: vi.fn(() => ({ get: mocks.get, update: mocks.update, delete: mocks.remove })),
    })),
  },
}));
vi.mock('firebase-admin/firestore', () => ({
  FieldValue: { serverTimestamp: () => '__SERVER_TS__' },
}));

import { DELETE, PATCH } from './route';

const context = (notificationId = 'notif-1') => ({
  params: Promise.resolve({ notificationId }),
});

const request = (method = 'PATCH') =>
  new NextRequest('http://localhost/api/notifications/notif-1', { method });

beforeEach(() => {
  mocks.requireAuthWithProfile.mockReset().mockResolvedValue({ profile: { uid: 'user-1' } });
  mocks.get.mockReset().mockResolvedValue({ exists: true, data: () => ({ userId: 'user-1' }) });
  mocks.update.mockReset().mockResolvedValue(undefined);
  mocks.remove.mockReset().mockResolvedValue(undefined);
});

describe('PATCH /api/notifications/[notificationId]', () => {
  it('rejects unauthenticated callers', async () => {
    mocks.requireAuthWithProfile.mockResolvedValue(
      NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    );

    const response = await PATCH(request(), context());

    expect(response.status).toBe(401);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('rejects a malformed id before reading anything', async () => {
    const response = await PATCH(request(), context('bad id!'));

    expect(response.status).toBe(400);
    expect(mocks.get).not.toHaveBeenCalled();
  });

  it('hides notifications that do not exist', async () => {
    mocks.get.mockResolvedValue({ exists: false });

    const response = await PATCH(request(), context());

    expect(response.status).toBe(404);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("hides another customer's notification", async () => {
    mocks.get.mockResolvedValue({ exists: true, data: () => ({ userId: 'user-2' }) });

    const response = await PATCH(request(), context());

    expect(response.status).toBe(404);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('marks the notification read', async () => {
    const response = await PATCH(request(), context());

    expect(mocks.update).toHaveBeenCalledWith({ read: true, readAt: '__SERVER_TS__' });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true });
  });
});

describe('DELETE /api/notifications/[notificationId]', () => {
  it('rejects a malformed id', async () => {
    const response = await DELETE(request('DELETE'), context('bad id!'));

    expect(response.status).toBe(400);
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it('hides a missing notification', async () => {
    mocks.get.mockResolvedValue({ exists: false });

    const response = await DELETE(request('DELETE'), context());

    expect(response.status).toBe(404);
  });

  it('deletes the notification', async () => {
    const response = await DELETE(request('DELETE'), context());

    expect(mocks.remove).toHaveBeenCalled();
    expect(response.status).toBe(200);
  });
});
