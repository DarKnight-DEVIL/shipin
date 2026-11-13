import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  getAdminAuthError: vi.fn(),
  get: vi.fn(),
  update: vi.fn(),
  recordAdminAudit: vi.fn(),
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

vi.mock('@/lib/adminAudit', () => ({
  __esModule: true,
  default: vi.fn(),
  recordAdminAudit: mocks.recordAdminAudit,
}));

vi.mock('firebase-admin/firestore', () => ({
  FieldValue: { serverTimestamp: () => '__SERVER_TS__' },
}));

import { PATCH } from './route';

const context = (shipmentId = 'ship-1') => ({ params: Promise.resolve({ shipmentId }) });

const request = (body: unknown = { courier: 'DHL' }) =>
  new NextRequest('http://localhost/api/admin/shipments/ship-1', {
    method: 'PATCH',
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

beforeEach(() => {
  mocks.requireAdmin.mockReset().mockResolvedValue({ uid: 'admin-1' });
  mocks.getAdminAuthError.mockReset().mockReturnValue({ error: 'Unauthorized', status: 401 });
  mocks.get.mockReset().mockResolvedValue({ exists: true, data: () => ({}) });
  mocks.update.mockReset().mockResolvedValue(undefined);
  mocks.recordAdminAudit.mockReset().mockResolvedValue(undefined);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('PATCH /api/admin/shipments/[shipmentId]', () => {
  it('returns the admin auth error unchanged', async () => {
    mocks.requireAdmin.mockRejectedValue(new Error('no token'));

    const response = await PATCH(request(), context());

    expect(response.status).toBe(401);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('requires a shipment id', async () => {
    const response = await PATCH(request(), context(''));

    expect(response.status).toBe(400);
  });

  it('rejects an unreadable body', async () => {
    const response = await PATCH(request('{broken'), context());

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: 'Invalid request body.' });
  });

  it('rejects an empty update', async () => {
    const response = await PATCH(request({}), context());

    expect(response.status).toBe(400);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('rejects negative dimensions', async () => {
    const response = await PATCH(request({ weight: -1 }), context());

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: 'Weight and dimensions must be non-negative numbers.',
    });
  });

  it('rejects a dimension that is not a number', async () => {
    const response = await PATCH(request({ length: 'wide' }), context());

    expect(response.status).toBe(400);
  });

  it('404s for an unknown shipment', async () => {
    mocks.get.mockResolvedValue({ exists: false });

    const response = await PATCH(request(), context());

    expect(response.status).toBe(404);
  });

  it('writes only the supplied fields, trimmed', async () => {
    const response = await PATCH(
      request({
        courier: '  DHL ',
        tracking: ' ABC123 ',
        weight: '5',
        height: 0,
        width: '',
        length: null,
      }),
      context()
    );

    await expect(response.json()).resolves.toEqual({ success: true });
    const updateCall = mocks.update.mock.calls[0][0];
    expect(updateCall.courier).toBe('DHL');
    expect(updateCall.tracking).toBe('ABC123');
    expect(updateCall.weight).toBe(5);
    expect(updateCall.height).toBe(0);
    expect(updateCall.updatedAt).toBe('__SERVER_TS__');
  });

  it('audits the write even when the audit collection add fails', async () => {
    mocks.recordAdminAudit.mockRejectedValue(new Error('add-failed'));

    await PATCH(
      request({
        courier: '  DHL ',
        tracking: ' ABC123 ',
        weight: '5',
        height: 0,
        width: '',
        length: null,
      }),
      context()
    );

    const updateCall = mocks.update.mock.calls[0][0];
    expect(updateCall.courier).toBe('DHL');
    expect(updateCall.tracking).toBe('ABC123');
    expect(updateCall.weight).toBe(5);
    expect(updateCall.height).toBe(0);
  });

  it('ignores non-string courier values', async () => {
    await PATCH(request({ courier: 42, weight: 2 }), context());

    expect(mocks.update.mock.calls[0][0]).not.toHaveProperty('courier');
  });

  it('reports a write failure', async () => {
    mocks.update.mockRejectedValue(new Error('offline'));

    const response = await PATCH(request(), context());

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({ error: 'offline' });
  });
});
