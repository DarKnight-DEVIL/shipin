import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import {
  createIndiaPostProvider,
  mapIndiaPostResponse,
  normalizeCarrierStatus,
} from './indiaPostProvider';
import { CarrierNotConfiguredError, CarrierRequestError } from './types';

const config = {
  endpoint: 'https://cept.example.test/track',
  clientId: 'client',
  clientSecret: 'secret',
};

describe('mapIndiaPostResponse', () => {
  it('maps only the allowlisted fields', () => {
    const snapshot = mapIndiaPostResponse({
      status: 'In Transit',
      expectedDelivery: '2026-06-02',
      // Carrier charges must never reach the snapshot.
      tariff: 1200,
      postage: 450,
      charges: [{ amount: 999 }],
      events: [
        {
          eventCode: 'IN_TRANSIT',
          eventDescription: 'Bag dispatched from Mumbai',
          officeName: 'Mumbai RMS',
          eventDate: '2026-05-20T09:30:00Z',
        },
      ],
    });

    expect(snapshot).toEqual({
      carrierStatus: 'in_transit',
      estimatedDelivery: '2026-06-02',
      events: [
        {
          code: 'IN_TRANSIT',
          description: 'Bag dispatched from Mumbai',
          location: 'Mumbai RMS',
          occurredAt: '2026-05-20T09:30:00.000Z',
        },
      ],
    });

    const serialized = JSON.stringify(snapshot);
    expect(serialized).not.toContain('tariff');
    expect(serialized).not.toContain('1200');
    expect(serialized).not.toContain('postage');
  });

  it('unwraps a data envelope', () => {
    const snapshot = mapIndiaPostResponse({
      data: {
        currentStatus: 'Item Delivered',
        trackingEvents: [
          {
            code: 'ITEM_DELIVERED',
            description: 'Delivered to addressee',
            timestamp: '2026-05-22T11:00:00Z',
          },
        ],
      },
    });

    expect(snapshot.carrierStatus).toBe('item_delivered');
    expect(snapshot.events).toHaveLength(1);
  });

  it('drops events without a code, description or date', () => {
    const snapshot = mapIndiaPostResponse({
      status: 'Unknown',
      events: [
        { code: 'OK', description: 'Fine', eventDate: '2026-05-01T00:00:00Z' },
        { description: 'Missing code', eventDate: '2026-05-01T00:00:00Z' },
        { code: 'NO_DATE', description: 'Missing date' },
        { code: 'BAD_DATE', description: 'Bad date', eventDate: 'not-a-date' },
        'not-an-object',
      ],
    });

    expect(snapshot.events).toHaveLength(1);
    expect(snapshot.events[0].code).toBe('OK');
  });

  it('falls back to unknown when nothing usable is present', () => {
    expect(mapIndiaPostResponse(null)).toEqual({
      carrierStatus: 'unknown',
      events: [],
    });
  });
});

describe('normalizeCarrierStatus', () => {
  it('normalises carrier wording', () => {
    expect(normalizeCarrierStatus('Out for Delivery')).toBe('out_for_delivery');
    expect(normalizeCarrierStatus('  DELIVERED  ')).toBe('delivered');
    expect(normalizeCarrierStatus(undefined)).toBe('unknown');
  });
});

describe('createIndiaPostProvider', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('refuses to run without credentials', async () => {
    const provider = createIndiaPostProvider({
      endpoint: '',
      clientId: '',
      clientSecret: '',
    });

    await expect(provider.fetchTracking('EE1IN')).rejects.toBeInstanceOf(
      CarrierNotConfiguredError
    );
  });

  it('posts the number and maps the answer', async () => {
    vi.mocked(global.fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          status: 'In Transit',
          events: [
            {
              eventCode: 'IN_TRANSIT',
              eventDescription: 'In transit',
              eventDate: '2026-05-20T09:30:00Z',
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );

    const provider = createIndiaPostProvider(config);
    const snapshot = await provider.fetchTracking('EE123456789IN');

    expect(snapshot.carrierStatus).toBe('in_transit');

    const [url, init] = vi.mocked(global.fetch).mock.calls[0];
    expect(url).toBe(config.endpoint);
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual({
      trackingNumber: 'EE123456789IN',
    });
    expect(String((init?.headers as Record<string, string>).Authorization)).toBe(
      `Basic ${Buffer.from('client:secret').toString('base64')}`
    );
  });

  it('reports a non-OK response as a carrier error', async () => {
    vi.mocked(global.fetch).mockResolvedValue(new Response('nope', { status: 503 }));

    const provider = createIndiaPostProvider(config);

    await expect(provider.fetchTracking('EE1IN')).rejects.toMatchObject({
      name: 'CarrierRequestError',
      status: 503,
    });
  });

  it('reports a transport failure as a carrier error', async () => {
    vi.mocked(global.fetch).mockRejectedValue(new Error('ECONNRESET'));

    const provider = createIndiaPostProvider(config);

    await expect(provider.fetchTracking('EE1IN')).rejects.toBeInstanceOf(
      CarrierRequestError
    );
  });

  it('reports unreadable JSON as a carrier error', async () => {
    vi.mocked(global.fetch).mockResolvedValue(new Response('not json', { status: 200 }));

    const provider = createIndiaPostProvider(config);

    await expect(provider.fetchTracking('EE1IN')).rejects.toBeInstanceOf(
      CarrierRequestError
    );
  });
});
