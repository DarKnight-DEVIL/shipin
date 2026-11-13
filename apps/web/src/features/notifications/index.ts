/**
 * @fileoverview Notifications feature – barrel export.
 */

export type { Notification } from './types';

export {
  createNotification,
  getNotifications,
  markNotificationRead,
  deleteNotification,
  markAllNotificationsRead,
  clearReadNotifications,
  subscribeToNotifications,
  getNotificationPreferences,
  saveNotificationPreferences,
} from './services/index';

