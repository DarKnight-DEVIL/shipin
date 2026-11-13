import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  getDocs: vi.fn(),
  getDoc: vi.fn(),
}));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db: unknown, name: string) => ({ path: name })),
  doc: vi.fn((_db: unknown, col: string, id: string) => ({ path: `${col}/${id}` })),
  getDocs: mocks.getDocs,
  getDoc: mocks.getDoc,
}));
vi.mock('@/lib/firebaseDb', () => ({ db: {} }));

import { getCustomersWithWallets, getRefundRequestDetails } from './customers';

const snapshot = (entries: [string, Record<string, unknown>][]) => ({
  docs: entries.map(([id, data]) => ({ id, data: () => data })),
});

beforeEach(() => {
  mocks.getDocs.mockReset();
  mocks.getDoc.mockReset();
});

describe('getCustomersWithWallets', () => {
  it('joins wallet balances onto customer records', async () => {
    mocks.getDocs
      .mockResolvedValueOnce(
        snapshot([
          ['u1', { displayName: 'Ada', email: 'ada@x.com', photoURL: 'https://img/a.png' }],
          ['u2', { displayName: 'Grace', email: 'grace@x.com' }],
        ])
      )
      .mockResolvedValueOnce(snapshot([['u1', { balance: 42.5 }]]));

    await expect(getCustomersWithWallets()).resolves.toEqual([
      {
        id: 'u1',
        displayName: 'Ada',
        email: 'ada@x.com',
        photoURL: 'https://img/a.png',
        role: 'customer',
        walletBalance: 42.5,
      },
      {
        id: 'u2',
        displayName: 'Grace',
        email: 'grace@x.com',
        photoURL: '',
        role: 'customer',
        walletBalance: 0,
      },
    ]);
  });

  it('excludes administrator accounts', async () => {
    mocks.getDocs
      .mockResolvedValueOnce(
        snapshot([
          ['admin-1', { displayName: 'Admin', role: 'admin' }],
          ['u1', { displayName: 'Ada' }],
        ])
      )
      .mockResolvedValueOnce(snapshot([]));

    const customers = await getCustomersWithWallets();

    expect(customers.map((customer) => customer.id)).toEqual(['u1']);
  });

  it('falls back for missing names and unusable balances', async () => {
    mocks.getDocs
      .mockResolvedValueOnce(snapshot([['u1', {}]]))
      .mockResolvedValueOnce(snapshot([['u1', { balance: 'not-a-number' }]]));

    await expect(getCustomersWithWallets()).resolves.toEqual([
      {
        id: 'u1',
        displayName: 'Unnamed Customer',
        email: '',
        photoURL: '',
        role: 'customer',
        walletBalance: 0,
      },
    ]);
  });

  it('wraps read failures', async () => {
    mocks.getDocs.mockRejectedValue(new Error('offline'));

    await expect(getCustomersWithWallets()).rejects.toBeInstanceOf(Error);
  });
});

describe('getRefundRequestDetails', () => {
  const stored = (data: Record<string, unknown>) => ({
    exists: () => true,
    id: 'req-1',
    data: () => ({ userId: 'u1', ...data }),
  });

  it('refunds the whole amount to the wallet when that is the preference', async () => {
    mocks.getDoc.mockResolvedValue(stored({ refundRequest: { preference: 'wallet', amount: 80 } }));

    await expect(getRefundRequestDetails('req-1')).resolves.toEqual({
      id: 'req-1',
      userId: 'u1',
      preference: 'wallet',
      totalRefundAmount: 80,
      walletRefundAmount: 80,
    });
  });

  it('refunds only the original wallet portion for original_sources', async () => {
    mocks.getDoc.mockResolvedValue(
      stored({ refundRequest: { preference: 'original_sources', amount: 80, walletAmount: 30 } })
    );

    await expect(getRefundRequestDetails('req-1')).resolves.toMatchObject({
      walletRefundAmount: 30,
      totalRefundAmount: 80,
    });
  });

  it('falls back to the payment wallet amount', async () => {
    mocks.getDoc.mockResolvedValue(
      stored({
        preference: 'original_payment',
        amount: 80,
        payment: { walletAmount: 25 },
      })
    );

    await expect(getRefundRequestDetails('req-1')).resolves.toMatchObject({
      walletRefundAmount: 25,
    });
  });

  it('defaults to the wallet preference and zero amounts', async () => {
    mocks.getDoc.mockResolvedValue({
      exists: () => true,
      id: 'req-1',
      data: () => ({}),
    });

    await expect(getRefundRequestDetails('req-1')).rejects.toThrow(
      'This refund does not contain a wallet refund amount.'
    );
  });

  it('rejects an unknown preference with no wallet portion', async () => {
    mocks.getDoc.mockResolvedValue(
      stored({ refundRequest: { preference: 'paypal', amount: 80 } })
    );

    await expect(getRefundRequestDetails('req-1')).rejects.toThrow(
      'This refund does not contain a wallet refund amount.'
    );
  });

  it('rejects a missing request', async () => {
    mocks.getDoc.mockResolvedValue({ exists: () => false });

    await expect(getRefundRequestDetails('req-1')).rejects.toThrow('Refund request not found.');
  });

  it('wraps read failures', async () => {
    mocks.getDoc.mockRejectedValue(new Error('offline'));

    await expect(getRefundRequestDetails('req-1')).rejects.toBeInstanceOf(Error);
  });
});
