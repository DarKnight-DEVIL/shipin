import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mocks = vi.hoisted(() => {
  const transaction = {
    get: vi.fn(),
    set: vi.fn(),
  };
  return {
    transaction,
    doc: vi.fn((_collection: unknown, id: string) => ({ id })),
    collection: vi.fn((_db: unknown, name: string) => ({ name })),
    runTransaction: vi.fn(async (_db: unknown, handler: (tx: unknown) => Promise<unknown>) =>
      handler(transaction)
    ),
    serverTimestamp: vi.fn(() => '__SERVER_TS__'),
  };
});

vi.mock('firebase/firestore', () => ({
  collection: mocks.collection,
  doc: mocks.doc,
  runTransaction: mocks.runTransaction,
  serverTimestamp: mocks.serverTimestamp,
}));

vi.mock('@/lib/firebaseDb', () => ({ db: {} }));

import { generateTrackingId } from './tracking';

beforeEach(() => {
  mocks.transaction.get.mockReset();
  mocks.transaction.set.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('generateTrackingId', () => {
  it('starts the sequence at one', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-04T00:00:00Z'));
    mocks.transaction.get.mockResolvedValue({ exists: () => false });

    await expect(generateTrackingId()).resolves.toBe('SHP-2026-000001');
  });

  it('increments an existing counter', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2027-01-01T00:00:00Z'));
    mocks.transaction.get.mockResolvedValue({
      exists: () => true,
      data: () => ({ value: 41 }),
    });

    await expect(generateTrackingId()).resolves.toBe('SHP-2027-000042');
  });

  it('treats a missing counter value as zero', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-01T00:00:00Z'));
    mocks.transaction.get.mockResolvedValue({
      exists: () => true,
      data: () => ({}),
    });

    await expect(generateTrackingId()).resolves.toBe('SHP-2026-000001');
  });

  it('merges the new counter with a server timestamp', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-01T00:00:00Z'));
    mocks.transaction.get.mockResolvedValue({ exists: () => false });

    await generateTrackingId();

    expect(mocks.transaction.set).toHaveBeenCalledWith(
      { id: 'tracking' },
      { value: 1, updatedAt: '__SERVER_TS__' },
      { merge: true }
    );
  });
});
