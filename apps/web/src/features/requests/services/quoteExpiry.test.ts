import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mocks = vi.hoisted(() => {
  class FakeTimestamp {
    constructor(public readonly ms: number) {}
    toMillis() {
      return this.ms;
    }
  }
  return { FakeTimestamp };
});

vi.mock('firebase/firestore', () => ({ Timestamp: mocks.FakeTimestamp }));

import { getRemainingTime, isQuoteExpired } from './quoteExpiry';

const NOW = new Date('2026-02-01T12:00:00Z').getTime();

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('isQuoteExpired', () => {
  it('treats a missing expiry as not expired', () => {
    expect(isQuoteExpired(undefined)).toBe(false);
  });

  it('is true once the expiry time has passed', () => {
    expect(isQuoteExpired(new Date(NOW - 1))).toBe(true);
    expect(isQuoteExpired(new Date(NOW))).toBe(true);
  });

  it('is false before the expiry', () => {
    expect(isQuoteExpired(new Date(NOW + 60_000))).toBe(false);
  });

  it('accepts Firestore timestamps and ISO strings', () => {
    expect(isQuoteExpired(new mocks.FakeTimestamp(NOW - 1) as never)).toBe(true);
    expect(isQuoteExpired(new Date(NOW + 1000).toISOString())).toBe(false);
  });

  it('ignores an unparseable string', () => {
    expect(isQuoteExpired('not a date')).toBe(false);
  });
});

describe('getRemainingTime', () => {
  it('returns zeroes when there is no expiry', () => {
    expect(getRemainingTime(undefined)).toEqual({
      hours: 0,
      minutes: 0,
      seconds: 0,
      expired: false,
      totalMs: 0,
    });
  });

  it('marks an elapsed quote as expired', () => {
    expect(getRemainingTime(new Date(NOW - 1))).toEqual({
      hours: 0,
      minutes: 0,
      seconds: 0,
      expired: true,
      totalMs: 0,
    });
  });

  it('breaks the remainder into hours, minutes and seconds', () => {
    const remaining = 2 * 3_600_000 + 3 * 60_000 + 4_000;

    expect(getRemainingTime(new Date(NOW + remaining))).toEqual({
      hours: 2,
      minutes: 3,
      seconds: 4,
      expired: false,
      totalMs: remaining,
    });
  });

  it('handles a remainder under one minute', () => {
    expect(getRemainingTime(new Date(NOW + 45_000))).toMatchObject({
      hours: 0,
      minutes: 0,
      seconds: 45,
      expired: false,
    });
  });
});
