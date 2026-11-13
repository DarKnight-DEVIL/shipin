import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  addDoc: vi.fn(),
  updateDoc: vi.fn(),
  getDocs: vi.fn(),
  onSnapshot: vi.fn(),
}));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db: unknown, ...path: string[]) => ({ path: path.join('/') })),
  doc: vi.fn((_db: unknown, ...path: string[]) => ({ path: path.join('/') })),
  query: vi.fn((ref: unknown) => ({ ref })),
  where: vi.fn(() => ({})),
  orderBy: vi.fn(() => ({})),
  serverTimestamp: vi.fn(() => '__SERVER_TS__'),
  addDoc: mocks.addDoc,
  updateDoc: mocks.updateDoc,
  getDocs: mocks.getDocs,
  onSnapshot: mocks.onSnapshot,
}));
vi.mock('@/lib/firebaseDb', () => ({ db: {} }));

import {
  addSupportMessage,
  createSupportTicket,
  getSupportMessages,
  getSupportTicketsByCustomer,
  getSupportTicketsByRequest,
  markSupportTicketRead,
  resolveSupportTicket,
  subscribeToAllSupportTickets,
  subscribeToCustomerSupportTickets,
  subscribeToRequest,
  subscribeToRequests,
  subscribeToSupportMessages,
  subscribeToSupportTickets,
} from './index';

const docs = (...ids: string[]) => ({
  docs: ids.map((id) => ({ id, data: () => ({ ticketId: id }) })),
});

beforeEach(() => {
  mocks.addDoc.mockReset().mockResolvedValue({ id: 'new-id' });
  mocks.updateDoc.mockReset().mockResolvedValue(undefined);
  mocks.getDocs.mockReset().mockResolvedValue(docs('t-1'));
  mocks.onSnapshot.mockReset();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('createSupportTicket', () => {
  it('opens the ticket with timestamps', async () => {
    const id = await createSupportTicket({ customerId: 'c1', subject: 'Late parcel' } as never);

    expect(id).toBe('new-id');
    expect(mocks.addDoc).toHaveBeenCalledTimes(1);
    expect(mocks.addDoc.mock.calls[0][1]).toMatchObject({
      status: 'open',
      createdAt: '__SERVER_TS__',
      updatedAt: '__SERVER_TS__',
    });
  });

  it('adds the first message as sent by the customer', async () => {
    await createSupportTicket({
      customerId: 'c1',
      subject: 'Late parcel',
      firstMessage: 'Where is it?',
    } as never);

    expect(mocks.addDoc).toHaveBeenCalledTimes(2);
    expect(mocks.addDoc.mock.calls[1][1]).toMatchObject({
      ticketId: 'new-id',
      sender: 'customer',
      message: 'Where is it?',
    });
  });

  it('attributes a message without a customer to an admin', async () => {
    await createSupportTicket({ subject: 'Note', firstMessage: 'Internal' } as never);

    expect(mocks.addDoc.mock.calls[1][1]).toMatchObject({ sender: 'admin' });
  });

  it('skips the message when none is supplied', async () => {
    await createSupportTicket({ customerId: 'c1', subject: 'Late parcel' } as never);

    expect(mocks.addDoc).toHaveBeenCalledTimes(1);
  });

  it('wraps write failures', async () => {
    mocks.addDoc.mockRejectedValue(new Error('offline'));

    await expect(createSupportTicket({ customerId: 'c1' } as never)).rejects.toBeInstanceOf(Error);
  });
});

describe('ticket mutations', () => {
  it('appends a message', async () => {
    const id = await addSupportMessage('t-1', { sender: 'admin', message: 'Looking into it' } as never);

    expect(id).toBe('new-id');
    expect(mocks.addDoc.mock.calls[0][1]).toMatchObject({
      ticketId: 't-1',
      sender: 'admin',
      createdAt: '__SERVER_TS__',
    });
  });

  it('resolves a ticket', async () => {
    await resolveSupportTicket('t-1');

    expect(mocks.updateDoc).toHaveBeenCalledWith(
      { path: 'supportTickets/t-1' },
      { status: 'resolved', resolvedAt: '__SERVER_TS__', updatedAt: '__SERVER_TS__' }
    );
  });

  it('clears the unread flag for the given role', async () => {
    await markSupportTicketRead('t-1', 'customer');
    await markSupportTicketRead('t-1', 'admin');

    expect(mocks.updateDoc.mock.calls[0][1]).toMatchObject({ customerUnread: false });
    expect(mocks.updateDoc.mock.calls[1][1]).toMatchObject({ adminUnread: false });
  });

  it('wraps update failures', async () => {
    mocks.updateDoc.mockRejectedValue(new Error('offline'));

    await expect(resolveSupportTicket('t-1')).rejects.toBeInstanceOf(Error);
    await expect(markSupportTicketRead('t-1', 'admin')).rejects.toBeInstanceOf(Error);
  });
});

describe('support queries', () => {
  it('maps tickets by request', async () => {
    await expect(getSupportTicketsByRequest('req-1')).resolves.toEqual([
      { id: 't-1', ticketId: 't-1' },
    ]);
  });

  it('maps tickets by customer', async () => {
    await expect(getSupportTicketsByCustomer('c1')).resolves.toEqual([
      { id: 't-1', ticketId: 't-1' },
    ]);
  });

  it('maps messages', async () => {
    await expect(getSupportMessages('t-1')).resolves.toEqual([{ id: 't-1', ticketId: 't-1' }]);
  });

  it('wraps read failures', async () => {
    mocks.getDocs.mockRejectedValue(new Error('offline'));

    await expect(getSupportTicketsByRequest('req-1')).rejects.toBeInstanceOf(Error);
    await expect(getSupportTicketsByCustomer('c1')).rejects.toBeInstanceOf(Error);
    await expect(getSupportMessages('t-1')).rejects.toBeInstanceOf(Error);
  });
});

describe('support subscriptions', () => {
  function capture() {
    const unsubscribe = vi.fn();
    let emit: (snapshot: unknown) => void = () => {};
    mocks.onSnapshot.mockImplementation(
      (_query: unknown, callback: (snapshot: unknown) => void) => {
        emit = callback;
        return unsubscribe;
      }
    );
    return { unsubscribe, emit: (snapshot: unknown) => emit(snapshot) };
  }

  it('streams messages', () => {
    const { emit, unsubscribe } = capture();
    const received: unknown[] = [];

    const stop = subscribeToSupportMessages('t-1', (items) => received.push(items));
    emit(docs('m-1'));

    expect(received).toEqual([[{ id: 'm-1', ticketId: 'm-1' }]]);
    expect(stop).toBe(unsubscribe);
  });

  it('streams tickets for a request', () => {
    const { emit } = capture();
    const received: unknown[] = [];

    subscribeToSupportTickets('req-1', (items) => received.push(items));
    emit(docs('t-1'));

    expect(received).toHaveLength(1);
  });

  it('streams tickets for a customer', () => {
    const { emit } = capture();
    const received: unknown[] = [];

    subscribeToCustomerSupportTickets('c1', (items) => received.push(items));
    emit(docs('t-1', 't-2'));

    expect(received).toEqual([
      [
        { id: 't-1', ticketId: 't-1' },
        { id: 't-2', ticketId: 't-2' },
      ],
    ]);
  });

  it('streams every ticket for the admin queue', () => {
    const { emit } = capture();
    const received: unknown[] = [];

    subscribeToAllSupportTickets((items) => received.push(items));
    emit(docs('t-1'));

    expect(received).toHaveLength(1);
  });

  it('streams a single request', () => {
    const { emit } = capture();
    const received: unknown[] = [];

    subscribeToRequest('req-1', (request) => received.push(request));
    emit({ exists: () => true, id: 'req-1', data: () => ({ userId: 'c1' }) });

    expect(received).toEqual([{ id: 'req-1', userId: 'c1' }]);
  });

  it('reports a missing request as null', () => {
    const { emit } = capture();
    const received: unknown[] = [];

    subscribeToRequest('req-1', (request) => received.push(request));
    emit({ exists: () => false });

    expect(received).toEqual([null]);
  });

  it('streams a user request list', () => {
    const { emit } = capture();
    const received: unknown[] = [];

    subscribeToRequests('c1', (requests) => received.push(requests));
    emit(docs('r-1'));

    expect(received).toEqual([[{ id: 'r-1', ticketId: 'r-1' }]]);
  });
});
