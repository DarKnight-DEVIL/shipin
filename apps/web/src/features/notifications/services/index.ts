import {
  collection,
  query,
  where,
  getDocs,
  doc,
  orderBy,
  onSnapshot,
  getDoc,
} from 'firebase/firestore';

import { db } from "@/lib/firebaseDb";
import { customerApi } from '@/lib/customerApiClient';
import type { Notification } from '@/types/notification';
import type { NotificationPreferences } from '@/types/notificationPreferences';
import { DEFAULT_NOTIFICATION_PREFERENCES } from '@/types/notificationPreferences';
import { toShipINError } from '@/utils/errors';

export async function createNotification(
  userId: string,
  requestId: string | null,
  title: string,
  message: string,
  type: Notification['type']
): Promise<string> {
  try {
    const result = await customerApi<{ notificationId: string }>('/api/notifications', {
      method: 'POST',
      body: { userId, requestId, title, message, type },
    });

    return result.notificationId;
  } catch (error) {
    throw toShipINError(error);
  }
}

export async function getNotifications(
  userId: string,
  limit?: number
): Promise<Notification[]> {
  try {
    const q = query(
      collection(db, 'notifications'),
      where('userId', '==', userId),
      orderBy('createdAt', 'desc')
    );
    const snapshot = await getDocs(q);
    let results = snapshot.docs.map((doc) => ({ id: doc.id, ...(doc.data() as Omit<Notification, 'id'>) }));
    if (limit) results = results.slice(0, limit);
    return results;
  } catch (error) {
    throw toShipINError(error);
  }
}

export async function markNotificationRead(notificationId: string): Promise<void> {
  try {
    await customerApi<{ success: boolean }>(`/api/notifications/${notificationId}`, {
      method: 'PATCH',
      body: { read: true },
    });
  } catch (error) {
    throw toShipINError(error);
  }
}

export async function deleteNotification(notificationId: string): Promise<void> {
  try {
    await customerApi<{ success: boolean }>(`/api/notifications/${notificationId}`, {
      method: 'DELETE',
    });
  } catch (error) {
    throw toShipINError(error);
  }
}

export async function markAllNotificationsRead(userId: string): Promise<number> {
  try {
    void userId;

    const result = await customerApi<{ count: number }>('/api/notifications/read-all', {
      method: 'POST',
    });

    return result.count;
  } catch (error) {
    throw toShipINError(error);
  }
}

export async function clearReadNotifications(userId: string): Promise<number> {
  try {
    void userId;

    const result = await customerApi<{ count: number }>('/api/notifications/clear-read', {
      method: 'POST',
    });

    return result.count;
  } catch (error) {
    throw toShipINError(error);
  }
}

export function subscribeToNotifications(
  userId: string,
  callback: (notifications: Notification[]) => void
): () => void {
  const q = query(
    collection(db, 'notifications'),
    where('userId', '==', userId),
    orderBy('createdAt', 'desc')
  );
  return onSnapshot(q, (snapshot) => {
    callback(
      snapshot.docs.map((doc) => ({ id: doc.id, ...(doc.data() as Omit<Notification, 'id'>) }))
    );
  });
}

export async function getNotificationPreferences(
  userId: string
): Promise<NotificationPreferences> {
  try {
    const snapshot = await getDoc(doc(db, 'users', userId));
    if (!snapshot.exists()) {
      return DEFAULT_NOTIFICATION_PREFERENCES;
    }
    const saved = snapshot.data()?.preferences?.notifications;
    if (!saved) {
      return DEFAULT_NOTIFICATION_PREFERENCES;
    }
    return {
      channels: {
        ...DEFAULT_NOTIFICATION_PREFERENCES.channels,
        ...(saved.channels ?? {}),
      },
      whatsapp: {
        ...DEFAULT_NOTIFICATION_PREFERENCES.whatsapp,
        ...(saved.whatsapp ?? {}),
      },
      categories: {
        ...DEFAULT_NOTIFICATION_PREFERENCES.categories,
        ...(saved.categories ?? {}),
      },
    };
  } catch (error) {
    console.error('Failed to load notification preferences:', error);
    return DEFAULT_NOTIFICATION_PREFERENCES;
  }
}

export async function saveNotificationPreferences(
  userId: string,
  preferences: NotificationPreferences
): Promise<void> {
  try {
    void userId;

    await customerApi<{ success: boolean }>('/api/notifications/preferences', {
      method: 'PATCH',
      body: preferences,
    });
  } catch (error) {
    throw toShipINError(error);
  }
}
