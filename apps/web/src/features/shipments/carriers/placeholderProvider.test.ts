import { describe, it, expect } from 'vitest';

import { createPlaceholderProvider } from './placeholderProvider';

const provider = createPlaceholderProvider();

describe('placeholder tracking provider', () => {
  it('is flagged as placeholder data', () => {
    expect(provider.id).toBe('placeholder');
    expect(provider.placeholder).toBe(true);
  });

  it('returns the same feed for the same number', async () => {
    const first = await provider.fetchTracking('EE123456789IN');
    const second = await provider.fetchTracking('EE123456789IN');

    expect(second).toEqual(first);
  });

  it('emits well formed, customer-safe events', async () => {
    const snapshot = await provider.fetchTracking('EE123456789IN');

    expect(snapshot.events.length).toBeGreaterThanOrEqual(2);
    expect(snapshot.carrierStatus).toBe('in_transit');

    for (const event of snapshot.events) {
      expect(event.code).toMatch(/^[A-Z_]+$/);
      expect(event.description.length).toBeGreaterThan(0);
      expect(Number.isNaN(new Date(event.occurredAt).getTime())).toBe(false);
    }

    expect(snapshot.estimatedDelivery).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('anchors the feed to the current day, so it neither goes stale nor dates events ahead', async () => {
    const fixedNow = new Date('2027-03-15T10:00:00.000Z').getTime();
    const dated = createPlaceholderProvider({ now: () => fixedNow });

    const snapshot = await dated.fetchTracking('EE123456789IN');
    const weekMs = 7 * 24 * 60 * 60 * 1000;

    for (const event of snapshot.events) {
      const occurred = new Date(event.occurredAt).getTime();
      expect(occurred).toBeLessThan(fixedNow);
      expect(fixedNow - occurred).toBeLessThan(weekMs);
    }

    expect(new Date(snapshot.estimatedDelivery!).getTime()).toBeGreaterThan(fixedNow);
  });

  it('keeps a known number on a known day byte-identical', async () => {
    // A golden value: the seed comes from the hash of the carrier number, so a
    // change to that hash silently rewrites every customer's tracking history.
    const fixedNow = new Date('2027-03-15T10:00:00.000Z').getTime();
    const dated = createPlaceholderProvider({ now: () => fixedNow });

    await expect(dated.fetchTracking('EE123456789IN')).resolves.toEqual({
      carrierStatus: 'in_transit',
      events: [
        {
          code: 'ITEM_BOOKED',
          description: 'Item booked at the origin post office',
          location: 'Mumbai, IN',
          occurredAt: '2027-03-13T03:34:00.000Z',
        },
        {
          code: 'IN_TRANSIT',
          description: 'In transit to the destination country',
          location: 'Mumbai, IN',
          occurredAt: '2027-03-14T09:34:00.000Z',
        },
      ],
      estimatedDelivery: '2027-03-21',
    });
  });

  it('varies the feed by carrier number', async () => {
    const a = await provider.fetchTracking('EE111111111IN');
    const b = await provider.fetchTracking('EE999999999IN');

    expect(a).not.toEqual(b);
  });
});
