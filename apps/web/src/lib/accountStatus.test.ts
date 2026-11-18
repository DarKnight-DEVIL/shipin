import { describe, it, expect } from 'vitest';

import { getAccountBlock } from './accountStatus';

describe('getAccountBlock', () => {
  it('returns null for a missing profile', () => {
    expect(getAccountBlock(null)).toBeNull();
    expect(getAccountBlock(undefined)).toBeNull();
  });

  it('returns null for an ordinary active account', () => {
    expect(getAccountBlock({ role: 'customer' })).toBeNull();
  });

  it.each([
    ['disabled', true],
    ['suspended', true],
    ['banned', true],
    ['deletedAt', new Date('2026-01-01T00:00:00.000Z')],
    ['deletedAt', '2026-01-01T00:00:00.000Z'],
    ['deletionRequestedAt', new Date('2026-01-01T00:00:00.000Z')],
    ['anonymizedAt', '2026-01-01T00:00:00.000Z'],
    ['banned', 'fraud'],
    ['suspended', 'chargeback investigation'],
    ['disabled', 1],
  ])('blocks a profile whose %s is %j', (field, value) => {
    const block = getAccountBlock({ role: 'customer', [field]: value });

    expect(block).not.toBeNull();
    expect(block?.code).toMatch(/^ACCOUNT_/);
  });

  it.each([
    ['disabled', false],
    ['disabled', null],
    ['disabled', undefined],
    ['disabled', 'false'],
    ['disabled', '  '],
    ['banned', false],
    ['suspended', false],
    ['deletedAt', null],
    ['deletionRequestedAt', null],
    ['anonymizedAt', false],
  ])('ignores %s set to the inert value %j', (field, value) => {
    expect(getAccountBlock({ role: 'customer', [field]: value })).toBeNull();
  });

  it('reports the most consequential reason first', () => {
    expect(getAccountBlock({ deletedAt: new Date(), banned: true, suspended: true, disabled: true }))
      .toMatchObject({ status: 'deleted', code: 'ACCOUNT_DELETED' });

    expect(getAccountBlock({ banned: true, suspended: true, disabled: true }))
      .toMatchObject({ status: 'banned', code: 'ACCOUNT_BANNED' });

    expect(getAccountBlock({ suspended: true, disabled: true }))
      .toMatchObject({ status: 'suspended', code: 'ACCOUNT_SUSPENDED' });

    expect(getAccountBlock({ disabled: true }))
      .toMatchObject({ status: 'disabled', code: 'ACCOUNT_DISABLED' });
  });

  it('carries a user-facing message for each block', () => {
    for (const profile of [{ disabled: true }, { suspended: true }, { banned: true }, { deletedAt: 1 }]) {
      const block = getAccountBlock(profile);

      expect(block?.message.length).toBeGreaterThan(0);
    }
  });
});
