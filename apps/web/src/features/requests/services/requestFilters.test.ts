import { describe, it, expect } from 'vitest';

import { filterOptions, filterTitles, quickFilters, resolvePageTitle } from './requestFilters';
import { REQUEST_STATUS } from './requestStatus';
import { statusLabels } from './statusLabels';

describe('filterOptions', () => {
  it('leads with the unfiltered option', () => {
    expect(filterOptions[0]).toEqual({ value: '', label: 'All statuses' });
  });

  it('offers one entry per status', () => {
    expect(filterOptions).toHaveLength(Object.keys(statusLabels).length + 1);
  });

  it('uses the shared status labels', () => {
    expect(filterOptions).toContainEqual({
      value: REQUEST_STATUS.delivered,
      label: 'Delivered',
    });
  });
});

describe('filterTitles', () => {
  it('covers every status', () => {
    for (const value of Object.values(REQUEST_STATUS)) {
      expect(filterTitles[value]).toBe(statusLabels[value]);
    }
  });
});

describe('quickFilters', () => {
  it('keeps the shortlist used by the page header', () => {
    expect(quickFilters.map((filter) => filter.label)).toEqual([
      'All',
      'Quote ready',
      'Payment due',
      'In transit',
      'Delivered',
    ]);
  });
});

describe('resolvePageTitle', () => {
  it('defaults to My requests', () => {
    expect(resolvePageTitle(null)).toBe('My requests');
    expect(resolvePageTitle('')).toBe('My requests');
  });

  it('uses the status title when known', () => {
    expect(resolvePageTitle(REQUEST_STATUS.shipped)).toBe('Shipped');
  });

  it('falls back for an unknown status', () => {
    expect(resolvePageTitle('not-a-status')).toBe('My requests');
  });
});
