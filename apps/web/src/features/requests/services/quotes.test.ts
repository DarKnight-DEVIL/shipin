import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => {
  class MockTimestamp {
    constructor(private readonly date: Date) {}
    toDate() {
      return this.date;
    }
  }
  return {
    MockTimestamp,
    get: vi.fn(),
    update: vi.fn(),
  };
});

vi.mock('server-only', () => ({}));
vi.mock('firebase-admin/firestore', () => ({
  FieldValue: { serverTimestamp: () => '__SERVER_TS__' },
  Timestamp: mocks.MockTimestamp,
}));
vi.mock('@/lib/firebaseAdmin', () => ({
  adminDb: {
    collection: () => ({
      doc: () => ({ get: mocks.get, update: mocks.update }),
    }),
  },
}));

import { acceptQuote, regenerateQuote, saveDetailedQuote } from './quotes';
import type { Request } from '@/types/request';

const quote = (overrides: Record<string, unknown> = {}) =>
  ({
    productsTotal: 100,
    grandTotal: 120,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    expiresAt: new Date('2026-01-02T00:00:00Z'),
    ...overrides,
  }) as unknown as Request['quote'];

beforeEach(() => {
  mocks.get.mockReset();
  mocks.update.mockReset().mockResolvedValue(undefined);
});

describe('saveDetailedQuote', () => {
  it('normalises the quote, reopens review and clears the request flag', async () => {
    mocks.get.mockResolvedValue({
      exists: true,
      data: () => ({ quote: { regeneratedCount: 2 } }),
    });

    const createdAt = new Date('2026-02-01T00:00:00Z');
    const expiresAt = new Date('2026-02-02T00:00:00Z');

    await saveDetailedQuote('req-1', quote({ createdAt, expiresAt }));

    expect(mocks.update).toHaveBeenCalledWith({
      quote: {
        productsTotal: 100,
        grandTotal: 120,
        createdAt,
        expiresAt,
        expired: false,
        regeneratedCount: 3,
      },
      status: 'review',
      quoteRegenerationRequested: false,
      quoteRequestedAt: null,
      updatedAt: '__SERVER_TS__',
    });
  });

  it('starts the regeneration count at one', async () => {
    mocks.get.mockResolvedValue({ exists: true, data: () => ({}) });

    await saveDetailedQuote('req-1', quote());

    expect(mocks.update.mock.calls[0][0].quote.regeneratedCount).toBe(1);
  });

  it('converts Firestore timestamps and date strings to Dates', async () => {
    mocks.get.mockResolvedValue({ exists: true, data: () => ({}) });

    const createdAt = new mocks.MockTimestamp(new Date('2026-03-01T00:00:00Z'));
    await saveDetailedQuote(
      'req-1',
      quote({ createdAt, expiresAt: '2026-03-02T00:00:00Z' })
    );

    const saved = mocks.update.mock.calls[0][0].quote;
    expect(saved.createdAt).toEqual(new Date('2026-03-01T00:00:00Z'));
    expect(saved.expiresAt).toEqual(new Date('2026-03-02T00:00:00Z'));
  });

  it('defaults missing timestamps to now', async () => {
    mocks.get.mockResolvedValue({ exists: true, data: () => ({}) });

    await saveDetailedQuote('req-1', quote({ createdAt: undefined, expiresAt: undefined }));

    const saved = mocks.update.mock.calls[0][0].quote;
    expect(saved.createdAt).toBeInstanceOf(Date);
    expect(saved.expiresAt).toBeInstanceOf(Date);
  });

  it('rejects a missing request', async () => {
    mocks.get.mockResolvedValue({ exists: false });

    await expect(saveDetailedQuote('req-1', quote())).rejects.toThrow();
    expect(mocks.update).not.toHaveBeenCalled();
  });
});

describe('acceptQuote', () => {
  it('marks the quote accepted', async () => {
    mocks.get.mockResolvedValue({ exists: true, data: () => ({ quote: quote() }) });

    await acceptQuote('req-1');

    expect(mocks.update).toHaveBeenCalledWith({
      'quote.acceptedAt': '__SERVER_TS__',
      'quote.expired': false,
      status: 'quote_accepted',
      updatedAt: '__SERVER_TS__',
    });
  });

  it('rejects a request with no quote', async () => {
    mocks.get.mockResolvedValue({ exists: true, data: () => ({}) });

    await expect(acceptQuote('req-1')).rejects.toThrow('No valid quote to accept');
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('rejects an expired quote', async () => {
    mocks.get.mockResolvedValue({
      exists: true,
      data: () => ({ quote: quote({ expired: true }) }),
    });

    await expect(acceptQuote('req-1')).rejects.toThrow('No valid quote to accept');
  });

  it('rejects a missing request', async () => {
    mocks.get.mockResolvedValue({ exists: false });

    await expect(acceptQuote('req-1')).rejects.toThrow();
  });
});

describe('regenerateQuote', () => {
  it('issues a fresh 24 hour quote awaiting admin review', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-01T12:00:00Z'));
    mocks.get.mockResolvedValue({
      exists: true,
      data: () => ({ quote: { regeneratedCount: 4 } }),
    });

    await regenerateQuote('req-1', quote({ acceptedAt: new Date() as never }));

    const update = mocks.update.mock.calls[0][0];
    expect(update.quote).toMatchObject({
      createdAt: new Date('2026-05-01T12:00:00Z'),
      expiresAt: new Date('2026-05-02T12:00:00Z'),
      acceptedAt: null,
      expired: false,
      regeneratedCount: 5,
    });
    expect(update.status).toBe('review');
    expect(update.quoteRegenerationRequested).toBe(true);
    expect(update.quoteRequestedAt).toBe('__SERVER_TS__');

    vi.useRealTimers();
  });

  it('starts the regeneration count at one', async () => {
    mocks.get.mockResolvedValue({ exists: true, data: () => ({}) });

    await regenerateQuote('req-1', quote());

    expect(mocks.update.mock.calls[0][0].quote.regeneratedCount).toBe(1);
  });

  it('rejects a missing request', async () => {
    mocks.get.mockResolvedValue({ exists: false });

    await expect(regenerateQuote('req-1', quote())).rejects.toThrow();
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
