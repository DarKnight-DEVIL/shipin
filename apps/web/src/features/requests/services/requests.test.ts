import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  addDoc: vi.fn(),
  getDocs: vi.fn(),
  getDoc: vi.fn(),
  updateDoc: vi.fn(),
  onSnapshot: vi.fn(),
  orderBy: vi.fn((field: string, direction: string) => ({ orderBy: [field, direction] })),
  limit: vi.fn((value: number) => ({ limit: value })),
  startAfter: vi.fn((cursor: unknown) => ({ startAfter: cursor })),
  query: vi.fn((...parts: unknown[]) => ({ parts })),
}));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db: unknown, name: string) => ({ path: name })),
  doc: vi.fn((_db: unknown, col: string, id: string) => ({ path: `${col}/${id}`, id })),
  where: vi.fn(() => ({})),
  getDocs: mocks.getDocs,
  getDoc: mocks.getDoc,
  addDoc: mocks.addDoc,
  updateDoc: mocks.updateDoc,
  onSnapshot: mocks.onSnapshot,
  orderBy: mocks.orderBy,
  limit: mocks.limit,
  startAfter: mocks.startAfter,
  query: mocks.query,
  serverTimestamp: vi.fn(() => '__SERVER_TS__'),
}));
vi.mock('@/lib/firebaseDb', () => ({ db: {} }));

import {
  addAdditionalItemRequest,
  addRequest,
  approveAdditionalItem,
  createRequest,
  getRequestById,
  getRequests,
  markRequestPaid,
  recordPayment,
  rejectAdditionalItem,
  rejectRequest,
  requestQuoteRegeneration,
  subscribeToRequest,
  subscribeToRequests,
  updateAdditionalItemStatus,
  updateRequestStatus,
} from './requests';

const docSnapshot = (data?: Record<string, unknown>, id = 'req-1') => ({
  exists: () => data !== undefined,
  id,
  data: () => data,
});

const createData = {
  customerName: 'Ada',
  email: 'ada@example.com',
  items: [],
  shippingAddress: { country: 'GB' },
};

beforeEach(() => {
  mocks.addDoc.mockReset().mockResolvedValue({ id: 'req-new' });
  mocks.getDoc.mockReset().mockResolvedValue(docSnapshot({ userId: 'user-1' }));
  mocks.getDocs.mockReset().mockResolvedValue({ docs: [] });
  mocks.updateDoc.mockReset().mockResolvedValue(undefined);
  mocks.onSnapshot.mockReset();
  vi.stubGlobal('crypto', { randomUUID: () => 'uuid-1' });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('createRequest', () => {
  it('stores a submitted request with defaults', async () => {
    await expect(createRequest(createData as never, 'user-1')).resolves.toBe('req-new');

    expect(mocks.addDoc.mock.calls[0][1]).toEqual({
      userId: 'user-1',
      customerName: 'Ada',
      email: 'ada@example.com',
      items: [],
      shippingAddress: { country: 'GB' },
      notes: '',
      serviceSelections: { inspection: 'standard', shippingPreference: 'approval' },
      status: 'submitted',
      createdAt: '__SERVER_TS__',
      updatedAt: '__SERVER_TS__',
    });
  });

  it('keeps provided notes and service selections', async () => {
    await createRequest(
      {
        ...createData,
        notes: 'Fragile',
        serviceSelections: { inspection: 'premium', shippingPreference: 'hold' },
      } as never,
      'user-1'
    );

    expect(mocks.addDoc.mock.calls[0][1]).toMatchObject({
      notes: 'Fragile',
      serviceSelections: { inspection: 'premium', shippingPreference: 'hold' },
    });
  });

  it('wraps write failures', async () => {
    mocks.addDoc.mockRejectedValue(new Error('offline'));

    await expect(createRequest(createData as never, 'user-1')).rejects.toBeInstanceOf(Error);
  });

  it('exposes addRequest as an alias', async () => {
    await addRequest(createData as never, 'user-2');

    expect(mocks.addDoc.mock.calls[0][1]).toMatchObject({ userId: 'user-2' });
  });
});

describe('getRequests', () => {
  const docs = (count: number) =>
    Array.from({ length: count }, (_, index) => ({
      id: `req-${index}`,
      data: () => ({ status: 'submitted' }),
    }));

  it('reports more pages and trims the extra document', async () => {
    mocks.getDocs.mockResolvedValue({ docs: docs(21) });

    const page = await getRequests('user-1');

    expect(page.requests).toHaveLength(20);
    expect(page.hasMore).toBe(true);
    expect(page.lastDoc?.id).toBe('req-19');
  });

  it('reports the last page', async () => {
    mocks.getDocs.mockResolvedValue({ docs: docs(3) });

    const page = await getRequests('user-1', { limit: 5 });

    expect(page.requests).toHaveLength(3);
    expect(page.hasMore).toBe(false);
    expect(page.lastDoc?.id).toBe('req-2');
  });

  it('honours the sort options and page size', async () => {
    mocks.getDocs.mockResolvedValue({ docs: docs(1) });

    await getRequests('user-1', { limit: 2, sortField: 'updatedAt', sortDirection: 'asc' });

    expect(mocks.orderBy).toHaveBeenCalledWith('updatedAt', 'asc');
    expect(mocks.limit).toHaveBeenCalledWith(3);
  });

  it('applies a pagination cursor', async () => {
    mocks.getDocs.mockResolvedValue({ docs: docs(1) });
    const cursor = docs(1)[0];

    await getRequests('user-1', { startAfter: cursor as never });

    expect(mocks.startAfter).toHaveBeenCalledWith(cursor);
    expect(mocks.query.mock.calls.some((call) => call.includes(mocks.startAfter.mock.results[0].value))).toBe(true);
  });

  it('wraps read failures', async () => {
    mocks.getDocs.mockRejectedValue(new Error('offline'));

    await expect(getRequests('user-1')).rejects.toBeInstanceOf(Error);
  });
});

describe('getRequestById', () => {
  it('returns null when the request is missing', async () => {
    mocks.getDoc.mockResolvedValue(docSnapshot(undefined));

    await expect(getRequestById('req-1')).resolves.toBeNull();
  });

  it('returns the request with its id', async () => {
    mocks.getDoc.mockResolvedValue(docSnapshot({ status: 'paid' }, 'req-9'));

    await expect(getRequestById('req-9')).resolves.toEqual({ id: 'req-9', status: 'paid' });
  });

  it('wraps read failures', async () => {
    mocks.getDoc.mockRejectedValue(new Error('offline'));

    await expect(getRequestById('req-1')).rejects.toBeInstanceOf(Error);
  });
});

describe('updateRequestStatus', () => {
  it('writes the status and any extra fields', async () => {
    await updateRequestStatus('req-1', 'shipped', { trackingNumber: 'ABC' });

    expect(mocks.updateDoc).toHaveBeenCalledWith(
      { path: 'requests/req-1', id: 'req-1' },
      { status: 'shipped', trackingNumber: 'ABC', updatedAt: '__SERVER_TS__' }
    );
  });

  it('wraps write failures', async () => {
    mocks.updateDoc.mockRejectedValue(new Error('offline'));

    await expect(updateRequestStatus('req-1', 'paid')).rejects.toBeInstanceOf(Error);
  });
});

describe('subscriptions', () => {
  function capture() {
    const unsubscribe = vi.fn();
    let emit: (snapshot: unknown) => void = () => {};
    let emitError: ((error: Error) => void) | undefined;
    mocks.onSnapshot.mockImplementation(
      (_ref: unknown, callback: (snapshot: unknown) => void, onError?: (error: Error) => void) => {
        emit = callback;
        emitError = onError;
        return unsubscribe;
      }
    );
    return { unsubscribe, emit: (snapshot: unknown) => emit(snapshot), emitError: () => emitError };
  }

  it('streams a user request list', () => {
    const { emit, unsubscribe } = capture();
    const received: unknown[] = [];

    const stop = subscribeToRequests('user-1', (items) => received.push(items));
    emit({ docs: [{ id: 'req-1', data: () => ({ status: 'paid' }) }] });

    expect(received).toEqual([[{ id: 'req-1', status: 'paid' }]]);
    expect(stop).toBe(unsubscribe);
  });

  it('streams a single request', () => {
    const { emit } = capture();
    const received: unknown[] = [];

    subscribeToRequest('req-1', (request) => received.push(request));
    emit(docSnapshot({ status: 'paid' }));

    expect(received).toEqual([{ id: 'req-1', status: 'paid' }]);
  });

  it('reports a deleted request as null', () => {
    const { emit } = capture();
    const received: unknown[] = [];

    subscribeToRequest('req-1', (request) => received.push(request));
    emit(docSnapshot(undefined));

    expect(received).toEqual([null]);
  });

  it('forwards the error callback', () => {
    const { emitError } = capture();
    const onError = vi.fn();

    subscribeToRequest('req-1', () => {}, onError);

    expect(emitError()).toBe(onError);
  });
});

describe('rejectRequest', () => {
  it('marks the request rejected and notifies the customer', async () => {
    await rejectRequest('req-1', 'Prohibited item');

    expect(mocks.updateDoc.mock.calls[0][1]).toMatchObject({
      status: 'rejected',
      rejectionReason: 'Prohibited item',
      'statusHistory.rejected': '__SERVER_TS__',
    });
    expect(mocks.addDoc.mock.calls[0][1]).toMatchObject({
      userId: 'user-1',
      requestId: 'req-1',
      type: 'rejection',
      message: 'Your request has been rejected. Reason: Prohibited item',
    });
  });

  it('skips the notification when the request has no owner', async () => {
    mocks.getDoc.mockResolvedValue(docSnapshot(undefined));

    await rejectRequest('req-1', 'reason');

    expect(mocks.updateDoc).toHaveBeenCalled();
    expect(mocks.addDoc).not.toHaveBeenCalled();
  });

  it('wraps failures', async () => {
    mocks.updateDoc.mockRejectedValue(new Error('offline'));

    await expect(rejectRequest('req-1', 'reason')).rejects.toBeInstanceOf(Error);
  });
});

describe('requestQuoteRegeneration', () => {
  it('bumps the quote version', async () => {
    mocks.getDoc.mockResolvedValue(
      docSnapshot({ quote: { version: 3, regeneratedCount: 1 } })
    );

    await expect(requestQuoteRegeneration('req-1')).resolves.toBe(4);

    expect(mocks.updateDoc.mock.calls[0][1]).toMatchObject({
      quote: { version: 4, regeneratedCount: 2 },
      quoteRegenerationRequested: false,
    });
  });

  it('starts at version one without an existing quote', async () => {
    mocks.getDoc.mockResolvedValue(docSnapshot({}));

    await expect(requestQuoteRegeneration('req-1')).resolves.toBe(1);
  });

  it('wraps failures', async () => {
    mocks.getDoc.mockRejectedValue(new Error('offline'));

    await expect(requestQuoteRegeneration('req-1')).rejects.toBeInstanceOf(Error);
  });
});

describe('recordPayment', () => {
  const payment = { provider: 'paypal' as const, amount: 100, orderId: 'ORDER-1' };

  it('marks the request paid when the total is covered', async () => {
    mocks.getDoc.mockResolvedValue(
      docSnapshot({ quote: { breakdown: { grandTotal: 100 } } })
    );

    await recordPayment('req-1', payment);

    expect(mocks.updateDoc.mock.calls[0][1]).toMatchObject({
      payment: { provider: 'paypal', orderId: 'ORDER-1', captureId: null, amountPaid: 100 },
      status: 'paid',
    });
  });

  it('adds to an existing part payment and keeps it awaiting payment', async () => {
    mocks.getDoc.mockResolvedValue(
      docSnapshot({
        quote: { breakdown: { grandTotal: 150 } },
        payment: { amountPaid: 50 },
      })
    );

    await recordPayment('req-1', payment);

    expect(mocks.updateDoc.mock.calls[0][1]).toMatchObject({
      payment: { amountPaid: 150 },
      status: 'paid',
    });
  });

  it('stays awaiting payment when the remainder is still owed', async () => {
    mocks.getDoc.mockResolvedValue(
      docSnapshot({ quote: { breakdown: { grandTotal: 300 } } })
    );

    await recordPayment('req-1', payment);

    expect(mocks.updateDoc.mock.calls[0][1].status).toBe('awaiting_payment');
  });

  it('rejects a missing request', async () => {
    mocks.getDoc.mockResolvedValue(docSnapshot(undefined));

    await expect(recordPayment('req-1', payment)).rejects.toThrow('Request not found');
  });
});

describe('markRequestPaid', () => {
  const payment = { provider: 'wallet' as const, amount: 100, orderId: 'w-1', captureId: 'c-1' };

  it('records the payment and notifies the customer', async () => {
    mocks.getDoc.mockResolvedValue(
      docSnapshot({ userId: 'user-1', quote: { breakdown: { grandTotal: 100 } } })
    );

    await markRequestPaid('req-1', payment);

    expect(mocks.updateDoc.mock.calls[0][1]).toMatchObject({
      payment: { provider: 'wallet', captureId: 'c-1', amountPaid: 100 },
      status: 'paid',
    });
    expect(mocks.addDoc.mock.calls[0][1]).toMatchObject({
      title: 'Payment Received',
      type: 'payment',
    });
  });

  it('skips the notification without an owner', async () => {
    mocks.getDoc.mockResolvedValue(docSnapshot({ quote: { breakdown: { grandTotal: 100 } } }));

    await markRequestPaid('req-1', payment);

    expect(mocks.addDoc).not.toHaveBeenCalled();
  });

  it('rejects a missing request', async () => {
    mocks.getDoc.mockResolvedValue(docSnapshot(undefined));

    await expect(markRequestPaid('req-1', payment)).rejects.toThrow('Request not found');
  });
});

describe('addAdditionalItemRequest', () => {
  const item = { name: 'Cable', url: 'https://shop/cable', quantity: 2 };

  it('appends the item and starts an order change', async () => {
    mocks.getDoc.mockResolvedValue(
      docSnapshot({ status: 'warehouse_received', additionalItemRequests: [] })
    );

    await addAdditionalItemRequest('req-1', item);

    const update = mocks.updateDoc.mock.calls[0][1];
    expect(update.additionalItemRequests).toEqual([
      {
        id: 'uuid-1',
        name: 'Cable',
        url: 'https://shop/cable',
        quantity: 2,
        status: 'pending',
        repackingFee: 0,
        storageFee: 0,
        amountPaid: 0,
        orderChangeHold: true,
        requestedAt: '__SERVER_TS__',
      },
    ]);
    expect(update.orderChange).toMatchObject({
      active: true,
      requiresRepacking: false,
      repackingFee: 0,
    });
  });

  it('charges repacking for an already packed order', async () => {
    mocks.getDoc.mockResolvedValue(docSnapshot({ status: 'packed' }));

    await addAdditionalItemRequest('req-1', item);

    expect(mocks.updateDoc.mock.calls[0][1].orderChange).toMatchObject({
      requiresRepacking: true,
      repackingFee: 2,
    });
  });

  it('copes with a missing request document', async () => {
    mocks.getDoc.mockResolvedValue(docSnapshot(undefined));

    await addAdditionalItemRequest('req-1', item);

    expect(mocks.updateDoc.mock.calls[0][1].additionalItemRequests).toHaveLength(1);
  });

  it('wraps failures', async () => {
    mocks.updateDoc.mockRejectedValue(new Error('offline'));

    await expect(addAdditionalItemRequest('req-1', item)).rejects.toBeInstanceOf(Error);
  });
});

describe('additional item decisions', () => {
  const existing = { additionalItemRequests: [{ id: 'item-1', status: 'pending' }, { id: 'item-2', status: 'pending' }] };

  it('approves an item with its quote', async () => {
    mocks.getDoc.mockResolvedValue(docSnapshot(existing));

    await approveAdditionalItem('req-1', 'item-1', 40);

    const [approved, untouched] = mocks.updateDoc.mock.calls[0][1].additionalItemRequests;
    expect(approved).toMatchObject({
      id: 'item-1',
      status: 'awaiting_payment',
      unitPrice: 40,
      totalDue: 40,
    });
    expect(approved.quote).toMatchObject({ unitPrice: 40, totalDue: 40 });
    expect(untouched).toEqual({ id: 'item-2', status: 'pending' });
  });

  it('rejects an item', async () => {
    mocks.getDoc.mockResolvedValue(docSnapshot(existing));

    await rejectAdditionalItem('req-1', 'item-2');

    expect(mocks.updateDoc.mock.calls[0][1].additionalItemRequests).toEqual([
      { id: 'item-1', status: 'pending' },
      { id: 'item-2', status: 'rejected' },
    ]);
  });

  it('advances an item status', async () => {
    mocks.getDoc.mockResolvedValue(docSnapshot(existing));

    await updateAdditionalItemStatus('req-1', 'item-1', 'paid');

    expect(mocks.updateDoc.mock.calls[0][1].additionalItemRequests[0].status).toBe('paid');
  });

  it('handles a missing request document', async () => {
    mocks.getDoc.mockResolvedValue(docSnapshot(undefined));

    await approveAdditionalItem('req-1', 'item-1', 10);

    expect(mocks.updateDoc.mock.calls[0][1].additionalItemRequests).toEqual([]);
  });

  it('wraps failures', async () => {
    mocks.updateDoc.mockRejectedValue(new Error('offline'));

    await expect(approveAdditionalItem('req-1', 'item-1', 10)).rejects.toBeInstanceOf(Error);
    await expect(rejectAdditionalItem('req-1', 'item-1')).rejects.toBeInstanceOf(Error);
    await expect(updateAdditionalItemStatus('req-1', 'item-1', 'paid')).rejects.toBeInstanceOf(Error);
  });
});
