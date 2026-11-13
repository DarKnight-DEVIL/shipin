import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  getAdminAuthError: vi.fn(),
  get: vi.fn(),
  update: vi.fn(),
  createNotification: vi.fn(),
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
  FieldValue: { serverTimestamp: () => '__SERVER_TS__' },
}));
vi.mock('@/features/notifications/services/server', () => ({
  createNotification: mocks.createNotification,
}));

import { PATCH } from './route';

const context = (requestId = 'req-1') => ({ params: Promise.resolve({ requestId }) });

const request = (body: unknown = { measured: true }) =>
  new NextRequest('http://localhost/api/admin/requests/req-1/warehouse/checklist', {
    method: 'PATCH',
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

beforeEach(() => {
  mocks.requireAdmin.mockReset().mockResolvedValue({ uid: 'admin-1' });
  mocks.getAdminAuthError.mockReset().mockReturnValue({ error: 'Unauthorized', status: 401 });
  mocks.get.mockReset().mockResolvedValue({
    exists: true,
    data: () => ({ userId: 'user-1', warehouse: { checklist: {} } }),
  });
  mocks.update.mockReset().mockResolvedValue(undefined);
  mocks.createNotification.mockReset().mockResolvedValue('n-1');
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('PATCH /api/admin/requests/[requestId]/warehouse/checklist', () => {
  it('returns the admin auth error unchanged', async () => {
    mocks.requireAdmin.mockRejectedValue(new Error('no token'));

    const response = await PATCH(request(), context());

    expect(response.status).toBe(401);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('rejects an invalid request id', async () => {
    const response = await PATCH(request(), context(''));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: 'Invalid request ID.' });
  });

  it('rejects an unreadable body', async () => {
    const response = await PATCH(request('{broken'), context());

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: 'Invalid request body.' });
  });

  it('requires at least one checklist field', async () => {
    const response = await PATCH(request({}), context());

    expect(response.status).toBe(400);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('rejects unknown checklist fields', async () => {
    const response = await PATCH(request({ measured: true, hacked: true }), context());

    expect(response.status).toBe(400);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('404s for an unknown request', async () => {
    mocks.get.mockResolvedValue({ exists: false });

    const response = await PATCH(request(), context());

    expect(response.status).toBe(404);
  });

  it('writes one dotted field per checklist entry', async () => {
    const response = await PATCH(request({ measured: true, photosUploaded: false }), context());

    expect(mocks.update).toHaveBeenCalledWith({
      'warehouse.checklist.measured': true,
      'warehouse.checklist.photosUploaded': false,
      updatedAt: '__SERVER_TS__',
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toContain('no-store');
  });

  it('notifies the customer the first time the package arrives', async () => {
    await PATCH(request({ packageReceived: true }), context());

    expect(mocks.createNotification).toHaveBeenCalledWith(
      'user-1',
      'req-1',
      'Package Arrived',
      'Your package has been checked into our warehouse.',
      'warehouse'
    );
  });

  it('does not repeat the arrival notification', async () => {
    mocks.get.mockResolvedValue({
      exists: true,
      data: () => ({ userId: 'user-1', warehouse: { checklist: { packageReceived: true } } }),
    });

    await PATCH(request({ packageReceived: true }), context());

    expect(mocks.createNotification).not.toHaveBeenCalled();
  });

  it('does not notify for other checklist items', async () => {
    await PATCH(request({ inspectionCompleted: true }), context());

    expect(mocks.createNotification).not.toHaveBeenCalled();
  });

  it('reports a write failure', async () => {
    mocks.update.mockRejectedValue(new Error('offline'));

    const response = await PATCH(request(), context());

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      error: 'Unable to update the checklist.',
    });
  });
});
