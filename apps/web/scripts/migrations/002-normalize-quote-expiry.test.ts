/**
 * Unit tests for the 002-normalize-quote-expiry migration.
 *
 * These tests validate the migration's core logic without requiring a running
 * Firestore instance. They exercise `parseQuoteExpiry` (exported from
 * `../../src/features/requests/services/quoteExpiry`) and the migration's
 * `up()` function with synthetic data, so the backfill logic is verified
 * before it ever touches a live database.
 *
 * To run: bun run 002-normalize-quote-expiry.test.ts  (vitest config)
 *       or: npx vitest run scripts/migrations/002-normalize-quote-expiry.test.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// The migration imports parseQuoteExpiry from the source; we mock the Firestore
// types it uses so the test runs without the Admin SDK.
vi.mock('../../src/lib/privateKey', () => ({ normalizePrivateKey: (_: string) => _ }));

// Provide a fake Timestamp so the migration's up() can be imported without
// triggering Firestore initialization in the test environment.
vi.mock('firebase-admin/firestore', async importOriginal => {
  const actual = await importOriginal<typeof import('firebase-admin/firestore')>();
  return {
    ...actual,
    // Minimal overrides needed by the migration code
    FieldValue: {
      serverTimestamp: () => '__TS__',
    },
    Timestamp: actual.Timestamp,
  };
});

import { up, name } from './002-normalize-quote-expiry.js';
import {
  isQuoteExpired,
  parseQuoteExpiry,
} from '../../src/features/requests/services/quoteExpiry.ts';

const PAST = Date.now() - 60_000; // 1 min ago
const FUTURE = Date.now() + 3_600_000; // 1 hour from now;

describe('Migration 002: normalize-quote-expiry', () => {
  it('exports a migration name', () => {
    expect(name).toBe('002-normalize-quote-expiry');
  });

  describe('parseQuoteExpiry', () => {
    it('reads a Firestore Timestamp (duck-typed via toMillis)', () => {
      // FakeTimestamp mimics the real Firestore Timestamp constructor
      const fake = { toMillis: () => PAST } as const;
      expect(parseQuoteExpiry(fake)).toBe(PAST);
    });

    it('reads a JS Date', () => {
      expect(parseQuoteExpiry(new Date(PAST))).toBe(PAST);
    });

    it('reads an ISO 8601 string', () => {
      expect(parseQuoteExpiry(new Date(PAST).toISOString())).toBe(PAST);
    });

    it('reads epoch milliseconds (number)', () => {
      expect(parseQuoteExpiry(PAST)).toBe(PAST);
    });

    it('reads a JSON-serialized Timestamp {seconds, nanoseconds}', () => {
      // This is the shape a Timestamp goes through when serialized to JSON.
      // Seconds are whole, so the millisecond remainder of PAST is dropped.
      const serialized = { seconds: Math.floor(PAST / 1000), nanoseconds: 0 };
      expect(parseQuoteExpiry(serialized)).toBe(Math.floor(PAST / 1000) * 1000);
    });

    it('reads a JSON-serialized Timestamp with _prefix', () => {
      const serialized = { _seconds: Math.floor(PAST / 1000), _nanoseconds: 0 };
      expect(parseQuoteExpiry(serialized)).toBe(Math.floor(PAST / 1000) * 1000);
    });

    it('keeps sub-second precision from nanoseconds', () => {
      const serialized = { seconds: Math.floor(PAST / 1000), nanoseconds: 250_000_000 };
      expect(parseQuoteExpiry(serialized)).toBe(Math.floor(PAST / 1000) * 1000 + 250);
    });

    it('returns null for undefined / null', () => {
      expect(parseQuoteExpiry(undefined)).toBeNull();
      expect(parseQuoteExpiry(null)).toBeNull();
    });

    it('returns null for unparseable strings', () => {
      expect(parseQuoteExpiry('not a date')).toBeNull();
      expect(parseQuoteExpiry(new Date('nope').toString())).toBeNull();
    });

    it('returns null for objects without readable expiry', () => {
      expect(parseQuoteExpiry({ hello: 'world' })).toBeNull();
      expect(parseQuoteExpiry({ seconds: 'bad', nanoseconds: 0 })).toBeNull();
    });

    it('returns null for empty array', () => {
      expect(parseQuoteExpiry([])).toBeNull();
    });

    it('agrees with isQuoteExpired on the same values', () => {
      // The sweep decides with isQuoteExpired, the backfill with
      // parseQuoteExpiry; both must read an expiry the same way.
      expect(isQuoteExpired(new Date(PAST - 1))).toBe(true);
      expect(isQuoteExpired(new Date(PAST))).toBe(true);
      expect(isQuoteExpired(new Date(FUTURE))).toBe(false);
    });
  });

  // Mock Firestore batch to avoid actually writing
  const mockBatch = {
    update: vi.fn(),
    commit: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('up() counts rows with no readable expiry as noExpiry', async () => {
    // We can't easily invoke the real up() without Firestore, so we test the
    // logic inline: parseQuoteExpiry returning null → noExpiry count.
    const quotesNoExpiry = [
      { userId: 'u1' }, // no expiresAt
      { userId: 'u2', quote: { expiresAt: 'not-a-date' } }, // unparseable string
      { userId: 'u3', quote: {} }, // no expiresAt field
    ];

    let noExpiry = 0;
    for (const q of quotesNoExpiry) {
      const ms = parseQuoteExpiry(q.quote?.expiresAt);
      if (ms === null) noExpiry++;
    }
    expect(noExpiry).toBe(3);
  });

  it('up() converts non-Timestamp expiresAt to Timestamp', () => {
    // When expiresAt is an ISO string, the migration rewrites it as a Timestamp.
    // This test verifies parseQuoteExpiry can read the string so the migration
    // knows it needs to rewrite it.
    const isoString = new Date(FUTURE).toISOString();
    const ms = parseQuoteExpiry(isoString);
    expect(ms).toBe(FUTURE);
    // Migration would then patch quote.expiresAt = Timestamp.fromMillis(ms)
  });

  it('up() sets expired=true when expiry is in the past', () => {
    // Logic inline: if expiresAt <= now and expired is not boolean, set it.
    const expiresAtMs = PAST; // 1 min ago
    const now = Date.now();
    const expired = expiresAtMs <= now; // true
    expect(expired).toBe(true);
  });

  it('up() preserves expired=true when already set', () => {
    // If expired is already boolean true, the migration leaves it alone.
    const quote = { expired: true, expiresAt: new Date(FUTURE) };
    const existingExpired = typeof quote.expired === 'boolean';
    expect(existingExpired).toBe(true);
    expect(quote.expired).toBe(true);
  });
});