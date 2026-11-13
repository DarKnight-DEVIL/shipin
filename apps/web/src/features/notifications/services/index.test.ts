import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  getDocs: vi.fn(),
  getDoc: vi.fn(),
  onSnapshot: vi.fn(),
  customerApi: vi.fn(),
}));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db: unknown, ...path: string[]) => ({ path: path.join('/') })),
  doc: vi.fn((_db: unknown, ...path: string[]) => ({ path: path.join('/') })),
  query: vi.fn((ref: unknown) => ({ ref })),
  where: vi.fn(() => ({})),
  orderBy: vi.fn(() => ({})),
  getDocs: mocks.getDocs,
  getDoc: mocks.getDoc,
  onSnapshot: mocks.onSnapshot,
}));
vi.mock('@/lib/firebaseDb', () => ({ db: {} }));
vi.mock('@/lib/customerApiClient', () => ({ customerApi: mocks.customerApi }));

import {
  clearReadNotifications,
  createNotification,
  deleteNotification,
  getNotificationPreferences,
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  saveNotificationPreferences,
  subscribeToNotifications,
} from './index';
import { DEFAULT_NOTIFICATION_PREFERENCES } from '@/types/notificationPreferences';

const docs = (...ids: string[]) => ({
  docs: ids.map((id) => ({ id, data: () => ({ title: id, userId: 'user-1' }) })),
});

beforeEach(() => {
  mocks.getDocs.mockReset();
  mocks.getDoc.mockReset();
  mocks.onSnapshot.mockReset();
  mocks.customerApi.mockReset().mockResolvedValue({ success: true });
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('createNotification', () => {
  it('posts the notification and returns its id', async () => {
    mocks.customerApi.mockResolvedValue({ notificationId: 'n-1' });

    await expect(
      createNotification('user-1', 'req-1', 'Quote ready', 'Open it', 'quote')
    ).resolves.toBe('n-1');
    expect(mocks.customerApi).toHaveBeenCalledWith('/api/notifications', {
      method: 'POST',
      body: { userId: 'user-1', requestId: 'req-1', title: 'Quote ready', message: 'Open it', type: 'quote' },
    });
  });

  it('wraps API failures', async () => {
    mocks.customerApi.mockRejectedValue(new Error('permission-denied'));

    await expect(createNotification('u', null, 't', 'm', 'payment')).rejects.toMatchObject({
      name: 'AuthorizationError',
    });
  });
});

describe('getNotifications', () => {
  it('maps documents with their ids', async () => {
    mocks.getDocs.mockResolvedValue(docs('n-1', 'n-2'));

    await expect(getNotifications('user-1')).resolves.toEqual([
      { id: 'n-1', title: 'n-1', userId: 'user-1' },
      { id: 'n-2', title: 'n-2', userId: 'user-1' },
    ]);
  });

  it('applies a limit', async () => {
    mocks.getDocs.mockResolvedValue(docs('n-1', 'n-2', 'n-3'));

    const result = await getNotifications('user-1', 2);

    expect(result.map((notification) => notification.id)).toEqual(['n-1', 'n-2']);
  });

  it('treats a limit of zero as no limit', async () => {
    mocks.getDocs.mockResolvedValue(docs('n-1', 'n-2'));

    await expect(getNotifications('user-1', 0)).resolves.toHaveLength(2);
  });

  it('wraps read failures', async () => {
    mocks.getDocs.mockRejectedValue(new Error('offline'));

    await expect(getNotifications('user-1')).rejects.toBeInstanceOf(Error);
  });
});

describe('notification mutations', () => {
  it('marks one notification read', async () => {
    await markNotificationRead('n-1');

    expect(mocks.customerApi).toHaveBeenCalledWith('/api/notifications/n-1', {
      method: 'PATCH',
      body: { read: true },
    });
  });

  it('deletes a notification', async () => {
    await deleteNotification('n-1');

    expect(mocks.customerApi).toHaveBeenCalledWith('/api/notifications/n-1', {
      method: 'DELETE',
    });
  });

  it('marks everything read and returns the count', async () => {
    mocks.customerApi.mockResolvedValue({ count: 7 });

    await expect(markAllNotificationsRead('user-1')).resolves.toBe(7);
    expect(mocks.customerApi).toHaveBeenCalledWith('/api/notifications/read-all', {
      method: 'POST',
    });
  });

  it('clears read notifications and returns the count', async () => {
    mocks.customerApi.mockResolvedValue({ count: 3 });

    await expect(clearReadNotifications('user-1')).resolves.toBe(3);
    expect(mocks.customerApi).toHaveBeenCalledWith('/api/notifications/clear-read', {
      method: 'POST',
    });
  });

  it('wraps mutation failures', async () => {
    mocks.customerApi.mockRejectedValue(new Error('offline'));

    await expect(markNotificationRead('n-1')).rejects.toBeInstanceOf(Error);
    await expect(deleteNotification('n-1')).rejects.toBeInstanceOf(Error);
    await expect(markAllNotificationsRead('u')).rejects.toBeInstanceOf(Error);
    await expect(clearReadNotifications('u')).rejects.toBeInstanceOf(Error);
  });
});

describe('subscribeToNotifications', () => {
  it('delivers mapped notifications and returns the unsubscribe function', () => {
    const unsubscribe = vi.fn();
    let emit: (snapshot: unknown) => void = () => {};
    mocks.onSnapshot.mockImplementation((_query: unknown, callback: (snapshot: unknown) => void) => {
      emit = callback;
      return unsubscribe;
    });

    const received: unknown[] = [];
    const stop = subscribeToNotifications('user-1', (items) => received.push(items));
    emit(docs('n-1'));

    expect(received).toEqual([[{ id: 'n-1', title: 'n-1', userId: 'user-1' }]]);
    expect(stop).toBe(unsubscribe);
  });
});

describe('notification preferences', () => {
  it('returns defaults when the user document is missing', async () => {
    mocks.getDoc.mockResolvedValue({ exists: () => false });

    await expect(getNotificationPreferences('user-1')).resolves.toEqual(
      DEFAULT_NOTIFICATION_PREFERENCES
    );
  });

  it('returns defaults when nothing is saved yet', async () => {
    mocks.getDoc.mockResolvedValue({ exists: () => true, data: () => ({ preferences: {} }) });

    await expect(getNotificationPreferences('user-1')).resolves.toEqual(
      DEFAULT_NOTIFICATION_PREFERENCES
    );
  });

  it('merges partial saved preferences over the defaults', async () => {
    mocks.getDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({
        preferences: {
          notifications: {
            channels: { whatsapp: true },
            whatsapp: { phone: '+919876543210' },
            categories: { support: false },
          },
        },
      }),
    });

    const result = await getNotificationPreferences('user-1');

    expect(result.channels).toEqual({ inApp: true, email: true, whatsapp: true });
    expect(result.whatsapp.phone).toBe('+919876543210');
    expect(result.categories).toEqual({
      quote: true,
      payment: true,
      warehouse: true,
      shipping: true,
      delivery: true,
      support: false,
    });
  });

  it('falls back to defaults when the read fails', async () => {
    mocks.getDoc.mockRejectedValue(new Error('offline'));

    await expect(getNotificationPreferences('user-1')).resolves.toEqual(
      DEFAULT_NOTIFICATION_PREFERENCES
    );
    expect(console.error).toHaveBeenCalled();
  });

  it('saves preferences through the API', async () => {
    await saveNotificationPreferences('user-1', DEFAULT_NOTIFICATION_PREFERENCES);

    expect(mocks.customerApi).toHaveBeenCalledWith('/api/notifications/preferences', {
      method: 'PATCH',
      body: DEFAULT_NOTIFICATION_PREFERENCES,
    });
  });

  it('wraps save failures', async () => {
    mocks.customerApi.mockRejectedValue(new Error('offline'));

    await expect(
      saveNotificationPreferences('user-1', DEFAULT_NOTIFICATION_PREFERENCES)
    ).rejects.toBeInstanceOf(Error);
  });
});
