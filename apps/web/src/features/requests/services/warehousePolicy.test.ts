import { describe, it, expect } from 'vitest';

import { getStorageParams } from './warehousePolicy';

describe('getStorageParams', () => {
  it('returns the fixed storage policy', () => {
    expect(getStorageParams('deliver_now', 'standard')).toEqual({
      dailyFine: 3,
      freeStorageDays: 7,
    });
  });

  it('is independent of the shipping preference and storage type', () => {
    expect(getStorageParams('store', null)).toEqual(getStorageParams('deliver_now', 'oversized'));
  });
});
