import { collection, addDoc, query, where, getDocs, updateDoc, doc, serverTimestamp, orderBy, deleteDoc, writeBatch, onSnapshot, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
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
    const docRef = await addDoc(collection(db, 'notifications'), {
      userId,
      requestId,
      title,
      message,
      type,
      read: false,
      createdAt: serverTimestamp(),
    });
    return docRef.id;
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
    await updateDoc(doc(db, 'notifications', notificationId), {
      read: true,
    });
  } catch (error) {
    throw toShipINError(error);
  }
}

export async function deleteNotification(notificationId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'notifications', notificationId));
  } catch (error) {
    throw toShipINError(error);
  }
}

export async function markAllNotificationsRead(userId: string): Promise<number> {
  try {
    const q = query(
      collection(db, 'notifications'),
      where('userId', '==', userId),
      where('read', '==', false)
    );
    const snapshot = await getDocs(q);
    const batch = writeBatch(db);
    snapshot.docs.forEach((doc) => {
      batch.update(doc.ref, { read: true });
    });
    await batch.commit();
    return snapshot.size;
  } catch (error) {
    throw toShipINError(error);
  }
}

export async function clearReadNotifications(userId: string): Promise<number> {
  try {
    const q = query(
      collection(db, 'notifications'),
      where('userId', '==', userId),
      where('read', '==', true)
    );
    const snapshot = await getDocs(q);
    const batch = writeBatch(db);
    snapshot.docs.forEach((doc) => {
      batch.delete(doc.ref);
    });
    await batch.commit();
    return snapshot.size;
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
    await updateDoc(doc(db, 'users', userId), {
      'preferences.notifications': preferences,
      preferencesUpdatedAt: serverTimestamp(),
    });
  } catch (error) {
    throw toShipINError(error);
  }
}