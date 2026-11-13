/**
 * Tests for the admin wallet credit transaction.
 *
 * A fake Firestore transaction records reads and writes so the assertions can
 * cover the business rules (who may be credited, when a refund completes).
 */

import { describe, it, expect, vi } from 'vitest';

vi.mock('firebase-admin/firestore', () => ({
  FieldValue: { serverTimestamp: () => '__SERVER_TS__' },
}));

import { adminCreditWallet, type AdminCreditWalletParams } from './adminCreditWallet';

type Doc = Record<string, unknown>;
type Write = { kind: 'set' | 'update'; path: string; data: Doc; merge?: boolean };

function makeDb(seed: Record<string, Doc> = {}) {
  const store = new Map(Object.entries(seed));
  const writes: Write[] = [];
  const txId = 'tx-1';

  const db = {
    collection(name: string) {
      return {
        doc(id?: string) {
          const docId = id ?? txId;
          return { path: `${name}/${docId}`, id: docId };
        },
      };
    },
    async runTransaction(
      handler: (transaction: {
        get: (ref: { path: string }) => Promise<{ exists: boolean; data: () => Doc | undefined }>;
        set: (ref: { path: string }, data: Doc, options?: { merge?: boolean }) => void;
        update: (ref: { path: string }, data: Doc) => void;
      }) => Promise<unknown>
    ) {
      const transaction = {
        async get(ref: { path: string }) {
          const data = store.get(ref.path);
          return { exists: data !== undefined, data: () => data };
        },
        set(ref: { path: string }, data: Doc, options?: { merge?: boolean }) {
          writes.push({ kind: 'set', path: ref.path, data, merge: options?.merge });
        },
        update(ref: { path: string }, data: Doc) {
          writes.push({ kind: 'update', path: ref.path, data });
        },
      };
      return handler(transaction);
    },
  };

  return { db, writes, store };
}

const baseParams: AdminCreditWalletParams = {
  customerId: 'cust-1',
  creditAmount: 50,
  description: 'Goodwill credit',
  requestId: null,
  isRefund: false,
  adminId: 'admin-1',
  adminEmail: 'admin@shipin.app',
};

function customer(overrides: Doc = {}): Doc {
  return { role: 'customer', ...overrides };
}

function wallet(balance: number, currency = 'USD'): Doc {
  return { balance, currency };
}

function requestDoc(overrides: Doc = {}): Doc {
  return { userId: 'cust-1', ...overrides };
}

describe('adminCreditWallet — direct credit', () => {
  it('creates a wallet for a customer who has none', async () => {
    const { db, writes } = makeDb({ 'users/cust-1': customer() });

    await expect(adminCreditWallet(db as never, baseParams)).resolves.toEqual({
      previousBalance: 0,
      creditAdded: 50,
      newBalance: 50,
      transactionId: 'tx-1',
    });

    expect(writes[0]).toEqual({
      kind: 'set',
      path: 'wallets/cust-1',
      data: { balance: 50, currency: 'USD', updatedAt: '__SERVER_TS__' },
      merge: true,
    });
  });

  it('adds to the existing balance and keeps its currency', async () => {
    const { db, writes } = makeDb({
      'users/cust-1': customer(),
      'wallets/cust-1': wallet(100, 'EUR'),
    });

    const result = await adminCreditWallet(db as never, baseParams);

    expect(result).toMatchObject({ previousBalance: 100, newBalance: 150 });
    expect(writes[0].data).toMatchObject({ balance: 150, currency: 'EUR' });
  });

  it('writes an audit transaction with the admin identity', async () => {
    const { db, writes } = makeDb({ 'users/cust-1': customer() });

    await adminCreditWallet(db as never, baseParams);

    expect(writes[1]).toEqual({
      kind: 'set',
      path: 'walletTransactions/tx-1',
      data: {
        userId: 'cust-1',
        type: 'admin_credit',
        amount: 50,
        balanceAfter: 50,
        description: 'Goodwill credit',
        requestId: null,
        createdAt: '__SERVER_TS__',
        createdBy: 'admin-1',
        createdByEmail: 'admin@shipin.app',
      },
    });
  });

  it('records a null admin email when none is known', async () => {
    const { db, writes } = makeDb({ 'users/cust-1': customer() });

    await adminCreditWallet(db as never, { ...baseParams, adminEmail: null });

    expect(writes[1].data.createdByEmail).toBeNull();
  });
});

describe('adminCreditWallet — guards', () => {
  it('rejects an unknown customer', async () => {
    const { db } = makeDb({});

    await expect(adminCreditWallet(db as never, baseParams)).rejects.toThrow(
      'CUSTOMER_NOT_FOUND'
    );
  });

  it('never credits an administrator', async () => {
    const { db } = makeDb({ 'users/cust-1': { role: 'admin' } });

    await expect(adminCreditWallet(db as never, baseParams)).rejects.toThrow(
      'CANNOT_CREDIT_ADMIN'
    );
  });

  it('rejects a negative stored balance', async () => {
    const { db } = makeDb({
      'users/cust-1': customer(),
      'wallets/cust-1': wallet(-5),
    });

    await expect(adminCreditWallet(db as never, baseParams)).rejects.toThrow(
      'INVALID_WALLET_BALANCE'
    );
  });
});

describe('adminCreditWallet — refunds', () => {
  const refundParams: AdminCreditWalletParams = {
    ...baseParams,
    isRefund: true,
    requestId: 'req-1',
  };

  it('requires the request to exist', async () => {
    const { db } = makeDb({ 'users/cust-1': customer() });

    await expect(adminCreditWallet(db as never, refundParams)).rejects.toThrow(
      'REQUEST_NOT_FOUND'
    );
  });

  it('requires the request to belong to the customer', async () => {
    const { db } = makeDb({
      'users/cust-1': customer(),
      'requests/req-1': { userId: 'someone-else', refundRequest: { status: 'requested' } },
    });

    await expect(adminCreditWallet(db as never, refundParams)).rejects.toThrow(
      'REQUEST_CUSTOMER_MISMATCH'
    );
  });

  it('requires an active refund request', async () => {
    const { db } = makeDb({
      'users/cust-1': customer(),
      'requests/req-1': requestDoc({ refundRequest: { status: 'none' } }),
    });

    await expect(adminCreditWallet(db as never, refundParams)).rejects.toThrow(
      'REFUND_NOT_REQUESTED'
    );
  });

  it('refuses to refund the wallet twice', async () => {
    const { db } = makeDb({
      'users/cust-1': customer(),
      'requests/req-1': requestDoc({
        refundRequest: { status: 'requested', walletStatus: 'completed' },
      }),
    });

    await expect(adminCreditWallet(db as never, refundParams)).rejects.toThrow(
      'WALLET_REFUND_ALREADY_COMPLETED'
    );
  });

  it('keeps the refund open while the PayPal portion is pending', async () => {
    const { db, writes } = makeDb({
      'users/cust-1': customer(),
      'requests/req-1': requestDoc({
        refundRequest: {
          status: 'requested',
          walletAmount: 50,
          paypalAmount: 25,
          paypalRefundStatus: 'pending',
        },
      }),
    });

    await adminCreditWallet(db as never, refundParams);

    const update = writes.find((write) => write.kind === 'update');
    expect(update?.data).toMatchObject({
      'refundRequest.walletStatus': 'completed',
      'refundRequest.walletAmount': 50,
    });
    expect(update?.data).not.toHaveProperty('status');
    expect(update?.data).not.toHaveProperty('refundRequest.status');
  });

  it('completes the refund once every portion is done', async () => {
    const { db, writes } = makeDb({
      'users/cust-1': customer(),
      'requests/req-1': requestDoc({
        refundRequest: {
          status: 'requested',
          walletAmount: 50,
          paypalAmount: 25,
          paypalRefundStatus: 'completed',
        },
      }),
    });

    await adminCreditWallet(db as never, refundParams);

    const update = writes.find((write) => write.kind === 'update');
    expect(update?.data).toMatchObject({
      'refundRequest.walletStatus': 'completed',
      'refundRequest.status': 'completed',
      status: 'refunded',
      'statusHistory.refunded': '__SERVER_TS__',
    });
  });

  it('completes a wallet-only refund', async () => {
    const { db, writes } = makeDb({
      'users/cust-1': customer(),
      'requests/req-1': requestDoc({
        refundRequest: { status: 'requested', walletAmount: 50 },
      }),
    });

    await adminCreditWallet(db as never, refundParams);

    const update = writes.find((write) => write.kind === 'update');
    expect(update?.data.status).toBe('refunded');
  });

  it('records the credit as a refund transaction', async () => {
    const { db, writes } = makeDb({
      'users/cust-1': customer(),
      'requests/req-1': requestDoc({
        refundRequest: { status: 'requested', walletAmount: 50 },
      }),
    });

    await adminCreditWallet(db as never, refundParams);

    expect(writes[1].data).toMatchObject({
      type: 'refund',
      requestId: 'req-1',
      amount: 50,
    });
  });
});
