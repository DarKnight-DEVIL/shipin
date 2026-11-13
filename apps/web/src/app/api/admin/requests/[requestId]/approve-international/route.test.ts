import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  getAdminAuthError: vi.fn(),
  get: vi.fn(),
  update: vi.fn(),
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

import { POST } from './route';

const context = (requestId = 'req-1') => ({ params: Promise.resolve({ requestId }) });

const request = () =>
  new NextRequest('http://localhost/api/admin/requests/req-1/approve-international', {
    method: 'POST',
  });

const stored = (data: Record<string, unknown>) => ({ exists: true, data: () => data });

beforeEach(() => {
  mocks.requireAdmin.mockReset().mockResolvedValue({ uid: 'admin-1' });
  mocks.getAdminAuthError.mockReset().mockReturnValue({ error: 'Unauthorized', status: 401 });
  mocks.get.mockReset().mockResolvedValue(stored({ status: 'warehouse_received' }));
  mocks.update.mockReset().mockResolvedValue(undefined);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('POST /api/admin/requests/[requestId]/approve-international', () => {
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

  it('waits for customer approval when the preference requires it', async () => {
    mocks.get.mockResolvedValue(
      stored({ status: 'warehouse_received', serviceSelections: { shippingPreference: 'approval' } })
    );

    const response = await POST(request(), context());

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: 'Please wait for customer approval before international shipment.',
    });
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('advances a warehouse-received request with automatic shipping', async () => {
    mocks.get.mockResolvedValue(
      stored({ status: 'warehouse_received', serviceSelections: { shippingPreference: 'auto' } })
    );

    const response = await POST(request(), context());

    expect(mocks.update).toHaveBeenCalledWith({
      'warehouse.approvedAt': '__SERVER_TS__',
      updatedAt: '__SERVER_TS__',
      status: 'ready_for_international_shipping',
      storage: '__SERVER_TS__',
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true });
  });

  it('re-approves an already approved request without changing status', async () => {
    mocks.get.mockResolvedValue(
      stored({
        status: 'ready_for_international_shipping',
        serviceSelections: { shippingPreference: 'approval' },
      })
    );

    await POST(request(), context());

    expect(mocks.update.mock.calls[0][0]).not.toHaveProperty('status');
  });

  it('reports a write failure', async () => {
    mocks.update.mockRejectedValue(new Error('offline'));

    const response = await POST(request(), context());

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      error: 'Unable to approve the shipment.',
    });
  });
});
