import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  update: vi.fn(),
  get: vi.fn(),
  sendNotification: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('firebase-admin/firestore', () => ({
  FieldValue: { serverTimestamp: () => '__SERVER_TS__' },
}));
vi.mock('@/lib/firebaseAdmin', () => ({
  adminDb: {
    collection: vi.fn((name: string) => ({
      doc: vi.fn((id: string) => ({ path: `${name}/${id}`, get: mocks.get, update: mocks.update })),
    })),
  },
}));
vi.mock('@/features/notifications/services/notificationService', () => ({
  sendNotification: mocks.sendNotification,
}));

import {
  quoteRequestedNotificationPayload,
  requestNewQuoteAndNotify,
  requestNewQuoteToRequest,
} from './quoteRequestService';

beforeEach(() => {
  mocks.get.mockReset();
  mocks.update.mockReset().mockResolvedValue(undefined);
  mocks.sendNotification.mockReset().mockResolvedValue(undefined);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('requestNewQuoteToRequest', () => {
  it('flags the request and returns the notification context', async () => {
    mocks.get.mockResolvedValue({
      exists: true,
      data: () => ({ userId: 'user-1', customerName: 'Ada Lovelace' }),
    });

    await expect(requestNewQuoteToRequest({ requestId: 'req-1' })).resolves.toEqual({
      requestId: 'req-1',
      userId: 'user-1',
      customerName: 'Ada Lovelace',
    });

    expect(mocks.update).toHaveBeenCalledWith({
      status: 'quote_requested',
      quoteRegenerationRequested: true,
      quoteRequestedAt: '__SERVER_TS__',
    });
  });

  it('falls back to the shipping first name', async () => {
    mocks.get.mockResolvedValue({
      exists: true,
      data: () => ({ userId: 'user-1', shippingAddress: { firstName: 'Grace' } }),
    });

    await expect(requestNewQuoteToRequest({ requestId: 'req-1' })).resolves.toMatchObject({
      customerName: 'Grace',
    });
  });

  it('falls back to a neutral name', async () => {
    mocks.get.mockResolvedValue({ exists: true, data: () => ({ userId: 'user-1' }) });

    await expect(requestNewQuoteToRequest({ requestId: 'req-1' })).resolves.toMatchObject({
      customerName: 'Customer',
    });
  });

  it('rejects a missing request', async () => {
    mocks.get.mockResolvedValue({ exists: false });

    await expect(requestNewQuoteToRequest({ requestId: 'req-1' })).rejects.toThrow();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('rejects a document without data', async () => {
    mocks.get.mockResolvedValue({ exists: true, data: () => undefined });

    await expect(requestNewQuoteToRequest({ requestId: 'req-1' })).rejects.toThrow();
    expect(mocks.update).not.toHaveBeenCalled();
  });
});

describe('quoteRequestedNotificationPayload', () => {
  it('describes the acknowledgement on the in-app channel', () => {
    expect(
      quoteRequestedNotificationPayload({
        requestId: 'req-1',
        userId: 'user-1',
        customerName: 'Ada',
      })
    ).toEqual({
      userId: '',
      requestId: 'req-1',
      title: 'Quote Request Received',
      message: 'We’ve received your request for a new quote.',
      type: 'quote',
      category: 'quote',
      channels: { inApp: true, email: false, whatsapp: false },
      customerName: 'Ada',
    });
  });
});

describe('requestNewQuoteAndNotify', () => {
  beforeEach(() => {
    mocks.get.mockResolvedValue({
      exists: true,
      data: () => ({ userId: 'user-1', customerName: 'Ada' }),
    });
  });

  it('sends the notification and returns the context', async () => {
    await expect(requestNewQuoteAndNotify({ requestId: 'req-1' })).resolves.toMatchObject({
      requestId: 'req-1',
      customerName: 'Ada',
    });

    expect(mocks.sendNotification).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: 'req-1', category: 'quote' })
    );
  });

  it('still returns the context when the notification fails', async () => {
    mocks.sendNotification.mockRejectedValue(new Error('mail down'));

    await expect(requestNewQuoteAndNotify({ requestId: 'req-1' })).resolves.toMatchObject({
      userId: 'user-1',
    });
    expect(console.error).toHaveBeenCalledWith(
      'Quote-requested notification failed:',
      expect.any(Error)
    );
  });
});
