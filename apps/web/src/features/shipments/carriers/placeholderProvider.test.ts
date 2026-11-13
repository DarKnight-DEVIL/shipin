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

  it('varies the feed by carrier number', async () => {
    const a = await provider.fetchTracking('EE111111111IN');
    const b = await provider.fetchTracking('EE999999999IN');

    expect(a).not.toEqual(b);
  });
});
