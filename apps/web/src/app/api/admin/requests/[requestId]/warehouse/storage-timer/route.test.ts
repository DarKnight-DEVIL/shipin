import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  getAdminAuthError: vi.fn(),
  get: vi.fn(),
  update: vi.fn(),
  getStorageParams: vi.fn(),
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
vi.mock('@/features/requests/services/warehousePolicy', () => ({
  getStorageParams: mocks.getStorageParams,
}));

import { POST } from './route';

const context = (requestId = 'req-1') => ({ params: Promise.resolve({ requestId }) });

const request = () =>
  new NextRequest('http://localhost/api/admin/requests/req-1/warehouse/storage-timer', {
    method: 'POST',
  });

const stored = (data: Record<string, unknown>) => ({ exists: true, data: () => data });

beforeEach(() => {
  mocks.requireAdmin.mockReset().mockResolvedValue({ uid: 'admin-1' });
  mocks.getAdminAuthError.mockReset().mockReturnValue({ error: 'Unauthorized', status: 401 });
  mocks.get.mockReset().mockResolvedValue(stored({ status: 'warehouse_received' }));
  mocks.update.mockReset().mockResolvedValue(undefined);
  mocks.getStorageParams.mockReset().mockReturnValue({ dailyFine: 3, freeStorageDays: 14 });
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('POST /api/admin/requests/[requestId]/warehouse/storage-timer', () => {
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

  it('404s for an unknown request', async () => {
    mocks.get.mockResolvedValue({ exists: false });

    const response = await POST(request(), context());

    expect(response.status).toBe(404);
  });

  it('refuses before the package arrives', async () => {
    mocks.get.mockResolvedValue(stored({ status: 'paid' }));

    const response = await POST(request(), context());

    expect(response.status).toBe(409);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('starts the timer using the policy for this shipment', async () => {
    const now = 1_800_000_000_000;
    vi.spyOn(Date, 'now').mockReturnValue(now);
    mocks.get.mockResolvedValue(
      stored({
        status: 'warehouse_received',
        serviceSelections: { shippingPreference: 'hold' },
        warehouse: { storageType: 'small' },
      })
    );

    const response = await POST(request(), context());

    expect(mocks.getStorageParams).toHaveBeenCalledWith('hold', 'small');
    expect(mocks.update).toHaveBeenCalledWith({
      storage: {
        startedAt: now,
        freeUntil: now + 14 * 24 * 60 * 60 * 1000,
        dailyFine: 3,
        accumulatedFine: 0,
        active: true,
        freeStorageDays: 14,
      },
      updatedAt: '__SERVER_TS__',
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true });
  });

  it('defaults the preference and omits an unknown storage type', async () => {
    mocks.get.mockResolvedValue(stored({ status: 'packaged' }));

    await POST(request(), context());

    expect(mocks.getStorageParams).toHaveBeenCalledWith('approval', undefined);
  });

  it('reports a write failure', async () => {
    mocks.update.mockRejectedValue(new Error('offline'));

    const response = await POST(request(), context());

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      error: 'Unable to start the storage timer.',
    });
  });
});
