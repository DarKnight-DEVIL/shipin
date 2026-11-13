import { describe, it, expect } from 'vitest';

import { REQUEST_STATUS } from './requestStatus';
import { statusLabels } from './statusLabels';

describe('REQUEST_STATUS', () => {
  it('maps every key to its own string value', () => {
    for (const [key, value] of Object.entries(REQUEST_STATUS)) {
      expect(value).toBe(key);
    }
  });

  it('exposes the refund states as distinct statuses', () => {
    expect(REQUEST_STATUS.refund_requested).not.toBe(REQUEST_STATUS.refund_offered);
    expect(REQUEST_STATUS.refunded).toBe('refunded');
  });
});

describe('statusLabels', () => {
  it('has a label for every status', () => {
    for (const value of Object.values(REQUEST_STATUS)) {
      expect(statusLabels[value]).toBeTruthy();
    }
  });

  it('uses sentence case labels', () => {
    expect(statusLabels[REQUEST_STATUS.review]).toBe('Quote ready');
    expect(statusLabels[REQUEST_STATUS.ready_for_international_shipping]).toBe('Ready to ship');
    expect(statusLabels[REQUEST_STATUS.out_for_delivery]).toBe('Out for delivery');
  });
});
