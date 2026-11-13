import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  getAdminAuthError: vi.fn(),
  get: vi.fn(),
  update: vi.fn(),
  arrayUnion: vi.fn((value: unknown) => ({ __union: value })),
}));

vi.mock('@/lib/adminAuth', () => ({
  requireAdmin: mocks.requireAdmin,
  getAdminAuthError: mocks.getAdminAuthError,
}));
vi.mock('@/lib/firebaseAdmin', () => ({
  adminDb: {
    collection: vi.fn(() => ({ doc: vi.fn(() => ({ get: mocks.get, update: mocks.update })) })),
  },
}));
vi.mock('firebase-admin/firestore', () => ({
  FieldValue: {
    serverTimestamp: () => '__SERVER_TS__',
    arrayUnion: mocks.arrayUnion,
  },
}));

import { POST } from './route';

const PHOTO_ID = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
const photo = { id: PHOTO_ID, url: 'https://img/box.jpg' };

const context = (requestId = 'req-1') => ({ params: Promise.resolve({ requestId }) });

const request = (body: unknown = photo) =>
  new NextRequest('http://localhost/api/admin/requests/req-1/warehouse/inspection/photos', {
    method: 'POST',
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

beforeEach(() => {
  mocks.requireAdmin.mockReset().mockResolvedValue({ uid: 'admin-1' });
  mocks.getAdminAuthError.mockReset().mockReturnValue({ error: 'Unauthorized', status: 401 });
  mocks.get.mockReset().mockResolvedValue({ exists: true, data: () => ({ userId: 'user-1' }) });
  mocks.update.mockReset().mockResolvedValue(undefined);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('POST /api/admin/requests/[requestId]/warehouse/inspection/photos', () => {
  it('returns the admin auth error unchanged', async () => {
    mocks.requireAdmin.mockRejectedValue(new Error('no token'));

    const response = await POST(request(), context());

    expect(response.status).toBe(401);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('rejects an invalid request id', async () => {
    const response = await POST(request(), context(''));

    expect(response.status).toBe(400);
  });

  it('rejects an unreadable body', async () => {
    const response = await POST(request('{broken'), context());

    expect(response.status).toBe(400);
  });

  it('requires a UUID photo id and a url', async () => {
    const badId = await POST(request({ ...photo, id: 'not-a-uuid' }), context());
    const noUrl = await POST(request({ id: PHOTO_ID, url: '   ' }), context());

    expect(badId.status).toBe(400);
    expect(noUrl.status).toBe(400);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('404s for an unknown request', async () => {
    mocks.get.mockResolvedValue({ exists: false });

    const response = await POST(request(), context());

    expect(response.status).toBe(404);
  });

  it('appends the photo with an upload timestamp', async () => {
    const response = await POST(request({ ...photo, caption: 'Outer box' }), context());

    expect(mocks.arrayUnion).toHaveBeenCalledWith({
      id: PHOTO_ID,
      url: 'https://img/box.jpg',
      caption: 'Outer box',
      uploadedAt: '__SERVER_TS__',
    });
    expect(mocks.update).toHaveBeenCalledWith({
      'warehouse.inspectionPhotos': { __union: expect.any(Object) },
      updatedAt: '__SERVER_TS__',
    });
    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({ success: true, photoId: PHOTO_ID });
  });

  it('defaults a missing caption to an empty string', async () => {
    await POST(request(), context());

    expect(mocks.arrayUnion.mock.calls[0][0]).toMatchObject({ caption: '' });
  });

  it('reports a write failure', async () => {
    mocks.update.mockRejectedValue(new Error('offline'));

    const response = await POST(request(), context());

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      error: 'Unable to upload the photo.',
    });
  });
});
