/**
 * Hook: subscribes to the current user's notifications and exposes their unread count.
 *
 * Call this inside any client component that needs the badge number. It manages the
 * Firestore onSnapshot lifecycle internally and returns `null` while unauthenticated.
 */
import { useEffect, useState } from "react";
import { auth } from "@/lib/firebase";
import type { Notification } from "@/features/notifications/types";
import { subscribeToNotifications } from "@/features/notifications/services";

export function useUnreadNotifications() {
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    const currentUser = auth.currentUser;
    if (!currentUser) return;

    const unsubscribe = subscribeToNotifications(currentUser.uid, (notifications) => {
      const count = notifications.filter((n: Notification) => !n.read).length;
      setUnreadCount(count);
    });

    return unsubscribe;
  }, []);

  return unreadCount;
}