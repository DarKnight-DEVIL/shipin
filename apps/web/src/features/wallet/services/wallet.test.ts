/**
 * Tests for the Firestore-backed wallet service.
 *
 * `firebase/firestore` is replaced with a tiny in-memory store so the
 * assertions describe real balance maths (increments, balanceAfter, refunds)
 * rather than mock call shapes.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => {
  const store = new Map<string, Record<string, unknown>>();
  const added: Record<string, unknown>[] = [];

  const applyUpdate = (path: string, data: Record<string, unknown>) => {
    const current = store.get(path) ?? { balance: 0, currency: 'USD' };
    const next: Record<string, unknown> = { ...current };
    for (const [key, value] of Object.entries(data)) {
      if (value && typeof value === 'object' && '__inc' in (value as object)) {
        next[key] = Number(next[key] ?? 0) + (value as { __inc: number }).__inc;
      } else {
        next[key] = value;
      }
    }
    store.set(path, next);
  };

  return {
    store,
    added,
    applyUpdate,
    doc: vi.fn((_db: unknown, col: string, id: string) => ({ path: `${col}/${id}` })),
    getDoc: vi.fn(async (ref: { path: string }) => {
      const data = store.get(ref.path);
      return {
        exists: () => data !== undefined,
        data: () => data,
      };
    }),
    setDoc: vi.fn(async (ref: { path: string }, data: Record<string, unknown>) => {
      store.set(ref.path, { ...data });
    }),
    updateDoc: vi.fn(async (ref: { path: string }, data: Record<string, unknown>) => {
      applyUpdate(ref.path, data);
    }),
    addDoc: vi.fn(async (_col: unknown, data: Record<string, unknown>) => {
      added.push(data);
      return { id: `txn-${added.length}` };
    }),
    collection: vi.fn((_db: unknown, name: string) => ({ name })),
    serverTimestamp: vi.fn(() => 'server-timestamp'),
    increment: vi.fn((n: number) => ({ __inc: n })),
    query: vi.fn((...args: unknown[]) => ({ args })),
    where: vi.fn((...args: unknown[]) => ({ args })),
    orderBy: vi.fn((...args: unknown[]) => ({ args })),
    getDocs: vi.fn(),
  };
});

vi.mock('firebase/firestore', () => ({
  doc: mocks.doc,
  getDoc: mocks.getDoc,
  setDoc: mocks.setDoc,
  updateDoc: mocks.updateDoc,
  addDoc: mocks.addDoc,
  collection: mocks.collection,
  serverTimestamp: mocks.serverTimestamp,
  increment: mocks.increment,
  query: mocks.query,
  where: mocks.where,
  orderBy: mocks.orderBy,
  getDocs: mocks.getDocs,
}));

vi.mock('@/lib/firebaseDb', () => ({ db: {} }));

import {
  deductFromWallet,
  depositToWallet,
  getWallet,
  getWalletTransactions,
  refundToWallet,
} from './wallet';

const USER = 'user-1';

beforeEach(() => {
  mocks.store.clear();
  mocks.added.length = 0;
  vi.clearAllMocks();
  mocks.updateDoc.mockImplementation(async (ref: { path: string }, data: Record<string, unknown>) => {
    mocks.applyUpdate(ref.path, data);
  });
  mocks.getDoc.mockImplementation(async (ref: { path: string }) => {
    const data = mocks.store.get(ref.path);
    return { exists: () => data !== undefined, data: () => data };
  });
});

describe('getWallet', () => {
  it('returns the stored wallet', async () => {
    mocks.store.set(`wallets/${USER}`, { balance: 250, currency: 'USD' });

    await expect(getWallet(USER)).resolves.toEqual({ balance: 250, currency: 'USD' });
    expect(mocks.setDoc).not.toHaveBeenCalled();
  });

  it('creates a zero-balance wallet on first read', async () => {
    await expect(getWallet(USER)).resolves.toEqual({ balance: 0, currency: 'USD' });

    expect(mocks.setDoc).toHaveBeenCalledWith(
      expect.objectContaining({ path: `wallets/${USER}` }),
      { balance: 0, currency: 'USD' }
    );
  });

  it('maps a Firestore permission error to an authorization error', async () => {
    mocks.getDoc.mockRejectedValueOnce(new Error('permission-denied'));

    await expect(getWallet(USER)).rejects.toMatchObject({ name: 'AuthorizationError' });
  });
});

describe('depositToWallet', () => {
  it('rejects non-positive amounts', async () => {
    await expect(depositToWallet(USER, 0)).rejects.toThrow('Deposit amount must be positive.');
    expect(mocks.updateDoc).not.toHaveBeenCalled();
  });

  it('increments the balance and records the transaction', async () => {
    mocks.store.set(`wallets/${USER}`, { balance: 100, currency: 'USD' });

    await depositToWallet(USER, 50, 'Top up');

    expect(mocks.store.get(`wallets/${USER}`)).toMatchObject({ balance: 150 });
    expect(mocks.added[0]).toMatchObject({
      userId: USER,
      type: 'deposit',
      amount: 50,
      balanceAfter: 150,
      description: 'Top up',
    });
  });
});

describe('deductFromWallet', () => {
  it('rejects non-positive amounts', async () => {
    await expect(deductFromWallet(USER, -1)).rejects.toThrow(
      'Deduction amount must be positive.'
    );
  });

  it('refuses to overdraw', async () => {
    mocks.store.set(`wallets/${USER}`, { balance: 10, currency: 'USD' });

    await expect(deductFromWallet(USER, 25)).rejects.toThrow('Insufficient wallet balance.');
    expect(mocks.store.get(`wallets/${USER}`)).toMatchObject({ balance: 10 });
  });

  it('decrements the balance and records a negative transaction', async () => {
    mocks.store.set(`wallets/${USER}`, { balance: 100, currency: 'USD' });

    await deductFromWallet(USER, 40, 'req-9');

    expect(mocks.store.get(`wallets/${USER}`)).toMatchObject({ balance: 60 });
    expect(mocks.added[0]).toMatchObject({
      type: 'payment',
      amount: -40,
      balanceAfter: 60,
      requestId: 'req-9',
    });
  });
});

describe('refundToWallet', () => {
  it('rejects non-positive amounts', async () => {
    await expect(refundToWallet(USER, 0)).rejects.toThrow('Refund amount must be positive.');
  });

  it('credits the balance and records a refund', async () => {
    mocks.store.set(`wallets/${USER}`, { balance: 20, currency: 'USD' });

    await refundToWallet(USER, 30, 'req-3');

    expect(mocks.store.get(`wallets/${USER}`)).toMatchObject({ balance: 50 });
    expect(mocks.added[0]).toMatchObject({
      type: 'refund',
      amount: 30,
      balanceAfter: 50,
      requestId: 'req-3',
    });
  });
});

describe('getWalletTransactions', () => {
  it('returns documents with their ids and newest-first ordering', async () => {
    mocks.getDocs.mockResolvedValue({
      docs: [
        { id: 't1', data: () => ({ type: 'deposit', amount: 10 }) },
        { id: 't2', data: () => ({ type: 'payment', amount: -5 }) },
      ],
    });

    await expect(getWalletTransactions(USER)).resolves.toEqual([
      { id: 't1', type: 'deposit', amount: 10 },
      { id: 't2', type: 'payment', amount: -5 },
    ]);
    expect(mocks.where).toHaveBeenCalledWith('userId', '==', USER);
    expect(mocks.orderBy).toHaveBeenCalledWith('createdAt', 'desc');
  });
});
