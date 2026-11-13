import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  get: vi.fn(),
  resolveTracking: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  requireAdmin: mocks.requireAdmin,
}));

vi.mock('@/lib/firebaseAdmin', () => ({
  adminDb: {
    collection: () => ({ doc: () => ({ get: mocks.get }) }),
  },
}));

vi.mock('@/features/shipments/services/trackingSync', () => ({
  resolveTracking: mocks.resolveTracking,
}));

import {
  CarrierNotConfiguredError,
  CarrierRequestError,
} from '@/features/shipments/carriers';
import { POST } from './route';

const context = (requestId = 'req-1') => ({ params: Promise.resolve({ requestId }) });

const post = () =>
  new NextRequest('http://localhost/api/admin/requests/req-1/tracking/refresh', {
    method: 'POST',
  });

const respondWith = (data: Record<string, unknown> | undefined) =>
  mocks.get.mockResolvedValue({ exists: data !== undefined, data: () => data });

const shipped = {
  status: 'shipped',
  tracking: {
    internalTrackingId: 'SHP-2026-000001',
    trackingNumber: 'EE123456789IN',
  },
};

beforeEach(() => {
  mocks.requireAdmin.mockReset().mockResolvedValue({ uid: 'admin-1' });
  mocks.resolveTracking.mockReset().mockResolvedValue({ trackingId: 'SHP-2026-000001' });
  respondWith(shipped);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('POST /api/admin/requests/[requestId]/tracking/refresh', () => {
  it('returns the auth response for a non-admin caller', async () => {
    mocks.requireAdmin.mockResolvedValue(
      NextResponse.json({ success: false }, { status: 403 })
    );

    const response = await POST(post(), context());

    expect(response.status).toBe(403);
    expect(mocks.resolveTracking).not.toHaveBeenCalled();
  });

  it('forces a refresh through the sync layer', async () => {
    const response = await POST(post(), context());

    expect(response.status).toBe(200);
    expect(mocks.resolveTracking).toHaveBeenCalledWith('SHP-2026-000001', {
      force: true,
    });
  });

  it('returns 404 for an unknown request', async () => {
    respondWith(undefined);

    const response = await POST(post(), context());

    expect(response.status).toBe(404);
  });

  it('refuses a request without a ShipIN number', async () => {
    respondWith({ status: 'packed', tracking: { trackingNumber: 'EE1IN' } });

    const response = await POST(post(), context());

    expect(response.status).toBe(409);
    expect(mocks.resolveTracking).not.toHaveBeenCalled();
  });

  it('refuses a request without a consignment number', async () => {
    respondWith({
      status: 'packed',
      tracking: { internalTrackingId: 'SHP-2026-000001' },
    });

    const response = await POST(post(), context());

    expect(response.status).toBe(409);
    expect(mocks.resolveTracking).not.toHaveBeenCalled();
  });

  it('maps an unconfigured carrier to 503', async () => {
    mocks.resolveTracking.mockRejectedValue(
      new CarrierNotConfiguredError('India Post')
    );

    const response = await POST(post(), context());

    expect(response.status).toBe(503);
  });

  it('maps a carrier failure to 502', async () => {
    mocks.resolveTracking.mockRejectedValue(
      new CarrierRequestError('India Post', 'down', 503)
    );

    const response = await POST(post(), context());

    expect(response.status).toBe(502);
  });

  it('rejects an invalid request id', async () => {
    const response = await POST(post(), { params: Promise.resolve({ requestId: 'bad id!' }) });

    expect(response.status).toBe(400);
  });
});
