# Notifications Feature

Notification management — creation, reading, deletion, and user preferences.

## Services

| Export | Description |
|--------|-------------|
| `createNotification(uid, requestId, title, message, type)` | Server-side push notification |
| `getNotifications(uid, limit?)` | Fetch unread + read notifications |
| `markNotificationRead(id)` | Mark single notification as read |
| `deleteNotification(id)` | Permanently remove |
| `markAllNotificationsRead(uid)` | Bulk-mark current user's notifications |
| `clearReadNotifications(uid)` | Delete all read notifications |
| `subscribeToNotifications(uid, callback)` | Realtime Firestore subscription |
| `getNotificationPreferences(uid)` | Channel/category toggles |
| `saveNotificationPreferences(uid, prefs)` | Persist preferences |

## Types

`NotificationType` union re-exported from `@/types/notification`:
`quote \| payment \| warehouse \| inspection \| shipment \| delivery \| system`.

## Conventions

- Use `subscribeToNotifications` on pages that need live updates (Dashboard, wallet).
- Unsubscribing is handled automatically by React effect cleanup — store the returned function.
- Notification types map to UI badge colors defined in `components/ui/StatusBadge.tsx`.
