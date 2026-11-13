import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  whereGet: vi.fn(),
  docGet: vi.fn(),
  update: vi.fn(),
}));

vi.mock('@/lib/firebaseAdmin', () => ({
  adminDb: {
    collection: () => ({
      where: () => ({ limit: () => ({ get: mocks.whereGet }) }),
      doc: () => ({ get: mocks.docGet, update: mocks.update }),
    }),
  },
}));

vi.mock('firebase-admin/firestore', () => ({
  FieldValue: { serverTimestamp: () => '__TS__' },
}));

import {
  mergeEvents,
  resolveTracking,
  MAX_STORED_EVENTS,
  TRACKING_CACHE_TTL_MS,
  type PublicTrackingEvent,
} from './trackingSync';
import type { TrackingProvider } from '@/features/shipments/carriers';
import { CarrierRequestError } from '@/features/shipments/carriers';

const NOW = new Date('2026-06-01T12:00:00Z').getTime();
const now = () => NOW;

const event = (code: string, hoursAgo: number, location?: string) => ({
  code,
  description: `${code} happened`,
  occurredAt: new Date(NOW - hoursAgo * 3600_000).toISOString(),
  ...(location ? { location } : {}),
});

function provider(
  overrides: Partial<TrackingProvider> = {}
): TrackingProvider {
  return {
    id: 'placeholder',
    placeholder: true,
    fetchTracking: vi.fn().mockResolvedValue({ carrierStatus: 'in_transit', events: [] }),
    ...overrides,
  };
}

function found(data: Record<string, unknown>, id = 'req-1') {
  mocks.whereGet.mockResolvedValue({
    empty: false,
    docs: [{ id, data: () => data }],
  });
}

const shipped = (overrides: Record<string, unknown> = {}) => ({
  status: 'shipped',
  createdAt: new Date(NOW - 5 * 86_400_000).toISOString(),
  statusHistory: { shipped: new Date(NOW - 4 * 86_400_000).toISOString() },
  tracking: {
    internalTrackingId: 'SHP-2026-000001',
    carrier: 'India Post',
    trackingNumber: 'EE123456789IN',
    lastSyncedAt: new Date(NOW - 60_000).toISOString(),
    events: [event('SHIPPED', 20, 'Mumbai')],
  },
  ...overrides,
});

beforeEach(() => {
  mocks.whereGet.mockReset();
  mocks.docGet.mockReset().mockResolvedValue({ exists: false });
  mocks.update.mockReset().mockResolvedValue(undefined);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('resolveTracking', () => {
  it('returns null for an unknown tracking id', async () => {
    mocks.whereGet.mockResolvedValue({ empty: true, docs: [] });

    await expect(resolveTracking('SHP-NOPE', { now })).resolves.toBeNull();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('still resolves links minted before the proxy existed', async () => {
    mocks.whereGet.mockResolvedValue({ empty: true, docs: [] });
    mocks.docGet.mockResolvedValue({
      exists: true,
      id: 'SHP-LEGACY-1',
      data: () => ({ status: 'packed', tracking: { lastSyncedAt: new Date(NOW).toISOString() } }),
    });

    const result = await resolveTracking('SHP-LEGACY-1', { now });

    expect(result?.trackingId).toBe('SHP-LEGACY-1');
    expect(result?.source).toBe('cache');
  });

  it('serves a fresh cache without touching the carrier', async () => {
    found(shipped());
    const feed = provider();

    const result = await resolveTracking('SHP-2026-000001', { provider: feed, now });

    expect(feed.fetchTracking).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      source: 'cache',
      syncPaused: false,
      trackingId: 'SHP-2026-000001',
      carrier: 'India Post',
    });
    expect(result?.events).toHaveLength(1);
  });

  it('never polls a delivered shipment again', async () => {
    found(
      shipped({
        tracking: {
          internalTrackingId: 'SHP-2026-000001',
          trackingNumber: 'EE123456789IN',
          syncPaused: true,
          deliveredAt: new Date(NOW - 86_400_000).toISOString(),
        },
      })
    );

    const feed = provider();
    const result = await resolveTracking('SHP-2026-000001', {
      provider: feed,
      now,
    });

    expect(feed.fetchTracking).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      syncPaused: true,
      syncPauseReason: 'delivered',
      source: 'cache',
    });
  });

  it('never polls a request that is already closed', async () => {
    found({ status: 'rejected' });
    const feed = provider();

    const result = await resolveTracking('SHP-2026-000001', { provider: feed, now });

    expect(feed.fetchTracking).not.toHaveBeenCalled();
    expect(result?.syncPauseReason).toBe('terminal_status');
  });

  it('does not poll before a carrier number exists', async () => {
    found({ status: 'packed', tracking: { internalTrackingId: 'SHP-2026-000001' } });
    const feed = provider();

    const result = await resolveTracking('SHP-2026-000001', { provider: feed, now });

    expect(feed.fetchTracking).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      syncPaused: true,
      syncPauseReason: 'no_carrier_number',
    });
    expect(result?.notice).toMatch(/handed over/i);
  });

  it('syncs a stale cache and stores the merged history', async () => {
    found(
      shipped({
        tracking: {
          internalTrackingId: 'SHP-2026-000001',
          trackingNumber: 'EE123456789IN',
          lastSyncedAt: new Date(NOW - TRACKING_CACHE_TTL_MS - 1).toISOString(),
          events: [event('SHIPPED', 20, 'Mumbai')],
        },
      })
    );

    const feed = provider({
      fetchTracking: vi.fn().mockResolvedValue({
        carrierStatus: 'in_transit',
        events: [event('IN_TRANSIT', 2, 'Chennai'), event('SHIPPED', 20, 'Mumbai')],
        estimatedDelivery: '2026-06-08',
      }),
    });

    const result = await resolveTracking('SHP-2026-000001', { provider: feed, now });

    expect(feed.fetchTracking).toHaveBeenCalledWith('EE123456789IN');

    const update = mocks.update.mock.calls[0][0];
    expect(update['tracking.carrierStatus']).toBe('in_transit');
    expect(update['tracking.lastSyncedAt']).toBe('__TS__');
    expect(update['tracking.estimatedDelivery']).toBe('2026-06-08');
    expect(update['tracking.events']).toHaveLength(2);

    expect(result).toMatchObject({ source: 'placeholder', syncPaused: false });
    expect(result?.events[0].code).toBe('IN_TRANSIT');
  });

  it('closes the last leg when the carrier reports delivery', async () => {
    found(
      shipped({
        status: 'out_for_delivery',
        tracking: {
          internalTrackingId: 'SHP-2026-000001',
          trackingNumber: 'EE123456789IN',
          lastSyncedAt: new Date(NOW - TRACKING_CACHE_TTL_MS - 1).toISOString(),
        },
      })
    );

    const feed = provider({
      placeholder: false,
      id: 'indiapost',
      fetchTracking: vi.fn().mockResolvedValue({
        carrierStatus: 'item_delivered',
        events: [event('ITEM_DELIVERED', 1, 'Bengaluru')],
      }),
    });

    const result = await resolveTracking('SHP-2026-000001', { provider: feed, now });

    const update = mocks.update.mock.calls[0][0];
    expect(update['tracking.syncPaused']).toBe(true);
    expect(update['tracking.deliveredAt']).toBe('__TS__');
    expect(update.status).toBe('delivered');
    expect(update['statusHistory.delivered']).toBe('__TS__');

    expect(result).toMatchObject({
      status: 'delivered',
      syncPaused: true,
      syncPauseReason: 'delivered',
      source: 'carrier',
    });
  });

  it('keeps the admin status when delivery arrives on an earlier leg', async () => {
    found(
      shipped({
        tracking: {
          internalTrackingId: 'SHP-2026-000001',
          trackingNumber: 'EE123456789IN',
          lastSyncedAt: new Date(NOW - TRACKING_CACHE_TTL_MS - 1).toISOString(),
        },
      })
    );

    const feed = provider({
      fetchTracking: vi.fn().mockResolvedValue({
        carrierStatus: 'delivered',
        events: [event('ITEM_DELIVERED', 1)],
      }),
    });

    await resolveTracking('SHP-2026-000001', { provider: feed, now });

    const update = mocks.update.mock.calls[0][0];
    expect(update.status).toBeUndefined();
    expect(update['tracking.syncPaused']).toBe(true);
  });

  it('falls back to the cached answer when the carrier fails', async () => {
    found(
      shipped({
        tracking: {
          internalTrackingId: 'SHP-2026-000001',
          trackingNumber: 'EE123456789IN',
          lastSyncedAt: new Date(NOW - TRACKING_CACHE_TTL_MS - 1).toISOString(),
          events: [event('SHIPPED', 20)],
        },
      })
    );

    const feed = provider({
      fetchTracking: vi
        .fn()
        .mockRejectedValue(new CarrierRequestError('India Post', 'down', 503)),
    });

    const result = await resolveTracking('SHP-2026-000001', { provider: feed, now });

    expect(result?.source).toBe('cache');
    expect(result?.notice).toMatch(/temporarily unavailable/i);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('surfaces a carrier failure when there is nothing cached', async () => {
    found(
      shipped({
        tracking: {
          internalTrackingId: 'SHP-2026-000001',
          trackingNumber: 'EE123456789IN',
          lastSyncedAt: new Date(NOW - TRACKING_CACHE_TTL_MS - 1).toISOString(),
        },
      })
    );

    const feed = provider({
      fetchTracking: vi.fn().mockRejectedValue(new CarrierRequestError('India Post', 'down')),
    });

    await expect(
      resolveTracking('SHP-2026-000001', { provider: feed, now })
    ).rejects.toBeInstanceOf(CarrierRequestError);
  });

  it('ignores unusable stored events', async () => {
    found(
      shipped({
        tracking: {
          internalTrackingId: 'SHP-2026-000001',
          lastSyncedAt: new Date(NOW).toISOString(),
          events: [
            { code: 'OK', description: 'fine', occurredAt: new Date(NOW).toISOString() },
            { description: 'no code' },
            null,
          ],
        },
      })
    );

    const result = await resolveTracking('SHP-2026-000001', { provider: provider(), now });

    expect(result?.events).toHaveLength(1);
  });
});

describe('mergeEvents', () => {
  const stored: PublicTrackingEvent[] = [
    { code: 'A', description: 'a', occurredAt: '2026-01-01T00:00:00.000Z' },
  ];

  it('dedupes and sorts newest first', () => {
    const merged = mergeEvents(stored, [
      { code: 'A', description: 'a', occurredAt: '2026-01-01T00:00:00.000Z' },
      { code: 'B', description: 'b', occurredAt: '2026-01-02T00:00:00.000Z' },
    ]);

    expect(merged.map((item) => item.code)).toEqual(['B', 'A']);
  });

  it('caps the stored history', () => {
    const many = Array.from({ length: 50 }, (_, index) => ({
      code: `E${index}`,
      description: 'x',
      occurredAt: new Date(NOW - index * 1000).toISOString(),
    }));

    expect(mergeEvents([], many)).toHaveLength(MAX_STORED_EVENTS);
  });
});

describe('forced refresh (admin)', () => {
  const paused = (overrides: Record<string, unknown> = {}) => ({
    status: 'delivered',
    tracking: {
      internalTrackingId: 'SHP-2026-000001',
      trackingNumber: 'EE123456789IN',
      syncPaused: true,
      deliveredAt: new Date(NOW - 86_400_000).toISOString(),
      lastSyncedAt: new Date(NOW - 60_000).toISOString(),
      events: [event('ITEM_DELIVERED', 24)],
    },
    ...overrides,
  });

  it('pulls the carrier even when polling is paused as delivered', async () => {
    found(paused());

    const feed = provider({
      placeholder: false,
      id: 'indiapost',
      fetchTracking: vi.fn().mockResolvedValue({
        carrierStatus: 'item_delivered',
        events: [event('ITEM_DELIVERED', 24), event('DELIVERY_UPDATED', 1)],
      }),
    });

    const result = await resolveTracking('SHP-2026-000001', {
      provider: feed,
      now,
      force: true,
    });

    expect(feed.fetchTracking).toHaveBeenCalledWith('EE123456789IN');
    expect(result?.events).toHaveLength(2);
    expect(result?.syncPaused).toBe(true);
    expect(mocks.update).toHaveBeenCalledTimes(1);
  });

  it('reopens polling when the carrier no longer reports delivery', async () => {
    found(
      paused({
        status: 'shipped',
        tracking: {
          internalTrackingId: 'SHP-2026-000001',
          trackingNumber: 'EE123456789IN',
          syncPaused: true,
          deliveredAt: new Date(NOW - 86_400_000).toISOString(),
        },
      })
    );

    const feed = provider({
      fetchTracking: vi.fn().mockResolvedValue({
        carrierStatus: 'in_transit',
        events: [event('IN_TRANSIT', 2)],
      }),
    });

    const result = await resolveTracking('SHP-2026-000001', {
      provider: feed,
      now,
      force: true,
    });

    expect(mocks.update.mock.calls[0][0]['tracking.syncPaused']).toBe(false);
    expect(result?.syncPaused).toBe(false);
    expect(result?.syncPauseReason).toBeNull();
  });

  it('does not pull a closed request back into the pipeline', async () => {
    found(paused({ status: 'refunded' }));

    const feed = provider({
      fetchTracking: vi.fn().mockResolvedValue({
        carrierStatus: 'item_delivered',
        events: [event('ITEM_DELIVERED', 24)],
      }),
    });

    const result = await resolveTracking('SHP-2026-000001', {
      provider: feed,
      now,
      force: true,
    });

    expect(mocks.update.mock.calls[0][0].status).toBeUndefined();
    expect(result?.status).toBe('refunded');
    expect(result?.syncPaused).toBe(true);
  });
});
