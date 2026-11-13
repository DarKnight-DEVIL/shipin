/**
 * Integration tests for processWalletPayment.
 *
 * Uses the in-memory Firestore mock so no real database is accessed.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// These suites rebuild their module graph per test (they reset modules so each
// case gets a fresh instance). That is cheap normally but can exceed the
// default 5s ceiling when the whole suite runs unisolated on a loaded machine,
// which surfaced as spurious timeouts. The assertions are unchanged.
vi.setConfig({ testTimeout: 15_000 });

type MockDocHandle = {
  get(): Promise<unknown>;
  update(data: Record<string, unknown>): Promise<void>;
  set(data: Record<string, unknown>): Promise<void>;
};

describe('processWalletPayment', () => {
  let fakeStore: Map<string, Record<string, unknown>>;
  let fakeAdminDb: {
    collection: ReturnType<typeof vi.fn>;
    runTransaction: ReturnType<typeof vi.fn>;
  };

  const USER_ID = 'user-1';
  const REQUEST_ID = 'test-req-1';
  const AMOUNT = 50;

  function makeDocRef(path: string) {
    return {
      id: path.split('/')[1],
      path,
      get: async () => {
        const data = fakeStore.get(path);
        return { exists: data !== undefined, data: () => data };
      },
      set: async (d: Record<string, unknown>) => { fakeStore.set(path, d); },
      update: async (d: Record<string, unknown>) => {
        const cur = fakeStore.get(path) ?? {};
        fakeStore.set(path, { ...cur, ...d });
      },
      delete: async () => fakeStore.delete(path),
    };
  }

  function setupDb() {
    fakeStore = new Map();
    fakeAdminDb = {
      collection: vi.fn((colName: string) => ({
        doc: vi.fn((docId: string) => makeDocRef(`${colName}/${docId}`)),
      })),
      runTransaction: vi.fn(async (fn: (tx: Record<string, unknown>) => Promise<unknown>) =>
        fn({
          get: async (ref: MockDocHandle) => ref.get(),
          update: async (ref: MockDocHandle, data: Record<string, unknown>) => ref.update(data),
          set: async (ref: MockDocHandle, data: Record<string, unknown>) => ref.set(data),
        })
      ),
    };
  }

  beforeEach(() => {
    vi.resetModules();
    setupDb();
    vi.doMock('@/lib/firebaseAdmin', () => ({ adminDb: fakeAdminDb }));
  });

  afterEach(() => {
    vi.doUnmock('@/lib/firebaseAdmin');
  });

  async function withFreshService(
    requestData: Record<string, unknown>,
    walletData: Record<string, unknown>
  ) {
    fakeStore.set(`requests/${REQUEST_ID}`, requestData);
    fakeStore.set(`wallets/${USER_ID}`, walletData);
    const { processWalletPayment: freshProcess } = await import('./walletPayment');
    return freshProcess;
  }

  it('deducts balance and marks request paid on success', async () => {
    const reqData = { userId: USER_ID, status: 'pending' };
    const walData = { userId: USER_ID, balance: 200, currency: 'USD' };
    const fn = await withFreshService(reqData, walData);

    const result = await fn(REQUEST_ID, AMOUNT, USER_ID);

    expect(result).toMatchObject({ success: true, transactionId: expect.any(String) });
    expect(fakeStore.get(`wallets/${USER_ID}`)?.balance).toBe(150);

    const updatedRequest = fakeStore.get(`requests/${REQUEST_ID}`) as
      | { status?: string; payment?: { amountPaid?: number } }
      | undefined;
    expect(updatedRequest?.status).toBe('paid');
    expect(updatedRequest?.payment?.amountPaid).toBe(AMOUNT);
  });

  it('rejects when request not found', async () => {
    const fn = await withFreshService({}, { balance: 100 });
    fakeStore.delete(`requests/${REQUEST_ID}`);

    await expect(fn(REQUEST_ID, AMOUNT, USER_ID)).rejects.toThrow('REQUEST_NOT_FOUND');
  });

  it('rejects unauthorized request (different user)', async () => {
    const reqData = { userId: 'other-user', status: 'pending' };
    const fn = await withFreshService(reqData, { balance: 100 });

    await expect(fn(REQUEST_ID, AMOUNT, USER_ID)).rejects.toThrow('UNAUTHORIZED_REQUEST');
  });

  it('rejects already-paid request (idempotency)', async () => {
    const reqData = { userId: USER_ID, status: 'paid' };
    const fn = await withFreshService(reqData, { balance: 200 });

    await expect(fn(REQUEST_ID, AMOUNT, USER_ID)).rejects.toThrow('ALREADY_PAID');
  });

  it('rejects insufficient balance', async () => {
    const reqData = { userId: USER_ID, status: 'pending' };
    const fn = await withFreshService(reqData, { balance: 30 });

    await expect(fn(REQUEST_ID, AMOUNT, USER_ID)).rejects.toThrow('INSUFFICIENT_BALANCE');
  });

  it('rejects when wallet does not exist', async () => {
    const reqData = { userId: USER_ID, status: 'pending' };
    const fn = await withFreshService(reqData, {});
    fakeStore.delete(`wallets/${USER_ID}`);

    await expect(fn(REQUEST_ID, AMOUNT, USER_ID)).rejects.toThrow('WALLET_NOT_FOUND');
  });
});

describe('walletPaymentErrorResponse', () => {
  const cases: [string, string, number][] = [
    ['REQUEST_NOT_FOUND', 'Request not found.', 404],
    ['UNAUTHORIZED_REQUEST', 'You are not authorized to access this request.', 403],
    ['ALREADY_PAID', 'This request has already been paid.', 400],
    ['WALLET_NOT_FOUND', 'Wallet not found.', 400],
    ['INSUFFICIENT_BALANCE', 'Insufficient wallet balance.', 400],
  ];

  it.each(cases)('maps %s to a %i response', async (code, message, status) => {
    const { walletPaymentErrorResponse } = await import('./walletPayment');

    expect(walletPaymentErrorResponse(new Error(code))).toEqual({
      code,
      message,
      status,
    });
  });

  it('returns null for an unrecognised error', async () => {
    const { walletPaymentErrorResponse } = await import('./walletPayment');

    expect(walletPaymentErrorResponse(new Error('something else'))).toBeNull();
  });

  it('returns null for a non-Error rejection', async () => {
    const { walletPaymentErrorResponse } = await import('./walletPayment');

    expect(walletPaymentErrorResponse('nope')).toBeNull();
    expect(walletPaymentErrorResponse(undefined)).toBeNull();
  });
});