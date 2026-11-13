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

import { PUT } from './route';

const inspection = { weight: 2.5, length: 30, width: 20, height: 10, condition: 'Good' };

const context = (requestId = 'req-1') => ({ params: Promise.resolve({ requestId }) });

const request = (body: unknown = inspection) =>
  new NextRequest('http://localhost/api/admin/requests/req-1/warehouse/inspection', {
    method: 'PUT',
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

beforeEach(() => {
  mocks.requireAdmin.mockReset().mockResolvedValue({ uid: 'admin-1' });
  mocks.getAdminAuthError.mockReset().mockReturnValue({ error: 'Unauthorized', status: 401 });
  mocks.get.mockReset().mockResolvedValue({ exists: true, data: () => ({ userId: 'user-1' }) });
  mocks.update.mockReset().mockResolvedValue(undefined);
  mocks.createNotification.mockReset().mockResolvedValue('n-1');
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('PUT /api/admin/requests/[requestId]/warehouse/inspection', () => {
  it('returns the admin auth error unchanged', async () => {
    mocks.requireAdmin.mockRejectedValue(new Error('no token'));

    const response = await PUT(request(), context());

    expect(response.status).toBe(401);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('rejects an invalid request id', async () => {
    const response = await PUT(request(), context(''));

    expect(response.status).toBe(400);
  });

  it('rejects an unreadable body', async () => {
    const response = await PUT(request('{broken'), context());

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: 'Invalid request body.' });
  });

  it('requires every measurement', async () => {
    const response = await PUT(request({ weight: 1, length: 2, width: 3 }), context());

    expect(response.status).toBe(400);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('rejects an unknown condition', async () => {
    const response = await PUT(request({ ...inspection, condition: 'Broken' }), context());

    expect(response.status).toBe(400);
  });

  it('404s for an unknown request', async () => {
    mocks.get.mockResolvedValue({ exists: false });

    const response = await PUT(request(), context());

    expect(response.status).toBe(404);
  });

  it('stores the measurements and notifies the customer', async () => {
    const response = await PUT(request(), context());

    expect(mocks.update).toHaveBeenCalledWith({
      'warehouse.weight': 2.5,
      'warehouse.length': 30,
      'warehouse.width': 20,
      'warehouse.height': 10,
      'warehouse.condition': 'Good',
      'warehouse.inspectionCompletedAt': '__SERVER_TS__',
      updatedAt: '__SERVER_TS__',
    });
    expect(mocks.createNotification).toHaveBeenCalledWith(
      'user-1',
      'req-1',
      'Inspection Complete',
      'Your warehouse inspection is now available.',
      'inspection'
    );
    expect(response.status).toBe(200);
  });

  it('defaults the condition when omitted', async () => {
    await PUT(
      request({ weight: 1, length: 1, width: 1, height: 1 }),
      context()
    );

    expect(mocks.update.mock.calls[0][0]['warehouse.condition']).toBe('Good');
  });

  it('skips the notification when the owner is unknown', async () => {
    mocks.get.mockResolvedValue({ exists: true, data: () => ({}) });

    await PUT(request(), context());

    expect(mocks.createNotification).not.toHaveBeenCalled();
  });

  it('reports a write failure', async () => {
    mocks.update.mockRejectedValue(new Error('offline'));

    const response = await PUT(request(), context());

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      error: 'Unable to save the inspection.',
    });
  });
});
