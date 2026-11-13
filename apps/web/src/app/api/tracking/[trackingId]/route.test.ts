/**
 * Tests for the public tracking route.
 *
 * The route is a thin shell over `resolveTracking`; the caching, carrier and
 * termination behaviour lives in trackingSync.test.ts.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({ resolveTracking: vi.fn() }));

vi.mock('@/features/shipments/services/trackingSync', () => ({
  resolveTracking: mocks.resolveTracking,
}));

import { CarrierRequestError } from '@/features/shipments/carriers';
import { GET, POST } from './route';

const context = (trackingId: string) => ({ params: { trackingId } });

const shipment = {
  trackingId: 'SHP-2026-000001',
  status: 'shipped',
  carrier: 'India Post',
  estimatedDelivery: '2026-06-08',
  createdAt: '2026-05-01T00:00:00.000Z',
  statusHistory: { shipped: '2026-05-02T00:00:00.000Z' },
  events: [
    {
      code: 'IN_TRANSIT',
      description: 'In transit',
      occurredAt: '2026-05-03T00:00:00.000Z',
    },
  ],
  carrierStatus: 'in_transit',
  lastSyncedAt: '2026-05-03T00:00:00.000Z',
  syncPaused: false,
  syncPauseReason: null,
  source: 'placeholder' as const,
};

beforeEach(() => {
  mocks.resolveTracking.mockReset();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('GET /api/tracking/:trackingId', () => {
  it('requires a tracking id', async () => {
    const response = await GET(
      new NextRequest('http://localhost/api/tracking/'),
      context('')
    );

    expect(response.status).toBe(400);
    expect(mocks.resolveTracking).not.toHaveBeenCalled();
  });

  it('404s for an unknown tracking id', async () => {
    mocks.resolveTracking.mockResolvedValue(null);

    const response = await GET(
      new NextRequest('http://localhost/api/tracking/SHP-NOPE'),
      context('SHP-NOPE')
    );
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body).toEqual({
      success: false,
      error: 'Shipment not found.',
      code: 'NOT_FOUND',
    });
  });

  it('returns the sanitised shipment view', async () => {
    mocks.resolveTracking.mockResolvedValue(shipment);

    const response = await GET(
      new NextRequest('http://localhost/api/tracking/SHP-2026-000001'),
      context('SHP-2026-000001')
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.shipment).toEqual(shipment);
    expect(response.headers.get('Cache-Control')).toContain('no-store');
  });

  it('does not expose the carrier consignment number', async () => {
    mocks.resolveTracking.mockResolvedValue(shipment);

    const response = await GET(
      new NextRequest('http://localhost/api/tracking/SHP-2026-000001'),
      context('SHP-2026-000001')
    );

    expect(JSON.stringify(await response.json())).not.toContain('EE123456789IN');
  });

  it('reports a carrier failure as 502', async () => {
    mocks.resolveTracking.mockRejectedValue(
      new CarrierRequestError('India Post', 'down', 503)
    );

    const response = await GET(
      new NextRequest('http://localhost/api/tracking/SHP-2026-000001'),
      context('SHP-2026-000001')
    );
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body.code).toBe('TRACKING_UPSTREAM_ERROR');
  });
});

describe('POST /api/tracking/:trackingId', () => {
  it('is not implemented yet', async () => {
    const response = await POST(
      new NextRequest('http://localhost/api/tracking/SHP-1', { method: 'POST' })
    );

    expect(response.status).toBe(501);
  });
});
