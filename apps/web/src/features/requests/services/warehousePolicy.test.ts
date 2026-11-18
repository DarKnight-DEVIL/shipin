import { describe, it, expect } from 'vitest';

import { getStorageParams } from './warehousePolicy';

describe('getStorageParams', () => {
  it('gives a hold order a longer free window than an automatic one', () => {
    expect(getStorageParams('hold').freeStorageDays).toBeGreaterThan(
      getStorageParams('approval').freeStorageDays
    );
    expect(getStorageParams('approval').freeStorageDays).toBeGreaterThan(
      getStorageParams('auto').freeStorageDays
    );
  });

  it('falls back to the standard rate for a preference it does not know', () => {
    expect(getStorageParams('deliver_now', 'standard')).toEqual({
      dailyFine: 3,
      freeStorageDays: 7,
    });
  });

  it('prices a known storage type and defaults an unknown one', () => {
    expect(getStorageParams('approval', 'small').dailyFine).toBe(3);
    expect(getStorageParams('approval', 'oversized')).toEqual(getStorageParams('approval', null));
  });
});
