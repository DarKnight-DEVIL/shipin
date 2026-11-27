/**
 * Hook: subscribes to the current user's notifications and exposes their unread count.
 *
 * Call this inside any client component that needs the badge number. It manages the
 * Firestore onSnapshot lifecycle internally and returns `null` while unauthenticated.
 *
 * The subscription is bounded by `NOTIFICATION_FEED_LIMIT`, so the number is the
 * unread count within the newest window and saturates at that limit.
 *
 * The user is resolved through `onAuthStateChanged`, not `auth.currentUser`: on a
 * cold load Firebase has not restored the session yet when a mount effect runs,
 * so reading `currentUser` once left the badge at zero until the component
 * remounted.
 */
import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase";
import type { Notification } from "@/features/notifications/types";
import { subscribeToNotifications } from "@/features/notifications/client";

export function useUnreadNotifications() {
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    let unsubscribeFromFeed: (() => void) | undefined;

    const unsubscribeFromAuth = onAuthStateChanged(auth, (user) => {
      unsubscribeFromFeed?.();
      unsubscribeFromFeed = undefined;

      if (!user) {
        setUnreadCount(0);
        return;
      }

      unsubscribeFromFeed = subscribeToNotifications(
        user.uid,
        (notifications) => {
          const count = notifications.filter(
            (n: Notification) => !n.read
          ).length;
          setUnreadCount(count);
        }
      );
    });

    return () => {
      unsubscribeFromAuth();
      unsubscribeFromFeed?.();
    };
  }, []);

  return unreadCount;
}
