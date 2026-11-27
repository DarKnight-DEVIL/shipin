import {
  collection,
  query,
  where,
  limit,
  getDocs,
  orderBy,
  onSnapshot,
} from "firebase/firestore";

export { WHATSAPP_COUNTRIES } from "../services/whatsappCountries";

import { db } from "@/lib/firebaseDb";
import { customerApi } from "@/lib/customerApiClient";
import type { Notification } from "@/types/notification";
import type { NotificationPreferences } from "@/types/notificationPreferences";
import { DEFAULT_NOTIFICATION_PREFERENCES } from "@/types/notificationPreferences";
import { toShipINError } from "@/utils/errors";

/**
 * Browser-safe notification client.
 *
 * The write itself belongs to the Admin SDK (`./server.ts`, called by
 * `POST /api/notifications`): the browser cannot hold service credentials.
 * This wrapper exists so UI code does not hand-roll the fetch, and it adds
 * nothing else — do not inline a second write path here.
 */
export async function createNotification(
  userId: string,
  requestId: string | null,
  title: string,
  message: string,
  type: Notification["type"]
): Promise<string> {
  try {
    const result = await customerApi<{ notificationId: string }>(
      "/api/notifications",
      {
        method: "POST",
        body: { userId, requestId, title, message, type },
      }
    );

    return result.notificationId;
  } catch (error) {
    throw toShipINError(error);
  }
}

export async function getNotifications(
  userId: string,
  max?: number
): Promise<Notification[]> {
  try {
    // The cap belongs in the query: slicing after getDocs still downloaded the
    // customer's whole history. A caller may ask for fewer than the feed limit,
    // never more.
    const pageSize =
      max && max > 0
        ? Math.min(max, NOTIFICATION_FEED_LIMIT)
        : NOTIFICATION_FEED_LIMIT;
    const q = query(
      collection(db, "notifications"),
      where("userId", "==", userId),
      orderBy("createdAt", "desc"),
      // firestore-list: internal — the notifications page shows the newest window.
      limit(pageSize)
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map((doc) => ({
      id: doc.id,
      ...(doc.data() as Omit<Notification, "id">),
    }));
  } catch (error) {
    throw toShipINError(error);
  }
}

export async function markNotificationRead(
  notificationId: string
): Promise<void> {
  try {
    await customerApi<{ success: boolean }>(
      `/api/notifications/${notificationId}`,
      {
        method: "PATCH",
        body: { read: true },
      }
    );
  } catch (error) {
    throw toShipINError(error);
  }
}

export async function deleteNotification(
  notificationId: string
): Promise<void> {
  try {
    await customerApi<{ success: boolean }>(
      `/api/notifications/${notificationId}`,
      {
        method: "DELETE",
      }
    );
  } catch (error) {
    throw toShipINError(error);
  }
}

export async function markAllNotificationsRead(
  userId: string
): Promise<number> {
  try {
    void userId;

    const result = await customerApi<{ count: number }>(
      "/api/notifications/read-all",
      {
        method: "POST",
      }
    );

    return result.count;
  } catch (error) {
    throw toShipINError(error);
  }
}

export async function clearReadNotifications(userId: string): Promise<number> {
  try {
    void userId;

    const result = await customerApi<{ count: number }>(
      "/api/notifications/clear-read",
      {
        method: "POST",
      }
    );

    return result.count;
  } catch (error) {
    throw toShipINError(error);
  }
}

/**
 * Most recent notifications held live in the browser.
 *
 * The listener used to carry every notification the account had ever received,
 * so a long-lived customer paid for their whole history on each snapshot. The
 * feed and the unread badge only ever show the newest few, so the subscription
 * is bounded; `useUnreadNotifications` therefore saturates at this number.
 */
export const NOTIFICATION_FEED_LIMIT = 30;

export function subscribeToNotifications(
  userId: string,
  callback: (notifications: Notification[]) => void
): () => void {
  const q = query(
    collection(db, "notifications"),
    where("userId", "==", userId),
    orderBy("createdAt", "desc"),
    // firestore-list: internal — the unread badge saturates at this window.
    limit(NOTIFICATION_FEED_LIMIT)
  );
  return onSnapshot(q, (snapshot) => {
    callback(
      snapshot.docs.map((doc) => ({
        id: doc.id,
        ...(doc.data() as Omit<Notification, "id">),
      }))
    );
  });
}

export async function getNotificationPreferences(
  userId: string
): Promise<NotificationPreferences> {
  try {
    void userId;

    const saved = await customerApi<{
      notifications?: Partial<NotificationPreferences> | null;
    }>("/api/notifications/preferences").then(
      (result) => result.notifications
    );
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
    console.error("Failed to load notification preferences:", error);
    return DEFAULT_NOTIFICATION_PREFERENCES;
  }
}

export async function saveNotificationPreferences(
  userId: string,
  preferences: NotificationPreferences
): Promise<void> {
  try {
    void userId;

    await customerApi<{ success: boolean }>("/api/notifications/preferences", {
      method: "PATCH",
      body: preferences,
    });
  } catch (error) {
    throw toShipINError(error);
  }
}
