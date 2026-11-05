/**
 * Re-export barrel for Firestore operations.
 * All data access logic has been moved to feature services.
 * This barrel maintains backward compatibility for existing consumers.
 */

// Requests
export {
  createRequest,
  getRequests,
  getRequestById,
  updateRequestStatus,
  rejectRequest,
  addAdditionalItemRequest,
  approveAdditionalItem,
  rejectAdditionalItem,
  updateAdditionalItemStatus,
  requestQuoteRegeneration,
  markRequestPaid,
  recordPayment,
  subscribeToRequests,
  subscribeToRequest,
} from '@/features/requests/services/requests';

/*
 * NOTE: Quote and shipment service functions (saveDetailedQuote,
 * acceptQuote, regenerateQuote, saveShipmentDetails,
 * updateShipmentStatus) use the Firebase Admin SDK and are
 * SERVER-ONLY. They are exported from '@/lib/firestoreServer' instead
 * so this client-safe barrel never pulls firebase-admin into the
 * browser bundle.
 */

export {
  saveWarehouseInspection,
  updateWarehouseChecklist,
  startStorageTimer,
  saveInspectionPhotos,
  saveWarehouseMeasurements,
  approveInternationalShipment,
} from '@/features/requests/services/warehouse';

// Addresses (legacy subcollection-based)
export {
  getAddresses,
  addAddress,
  updateAddress,
  deleteAddress,
  setDefaultAddress,
  getDefaultAddress,
} from '@/features/requests/services/addressesLegacy';

// Notifications
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
} from '@/features/notifications/services';

// Support
export {
  createSupportTicket,
  addSupportMessage,
  resolveSupportTicket,
  markSupportTicketRead,
  getSupportTicketsByRequest,
  getSupportTicketsByCustomer,
  getSupportMessages,
  subscribeToSupportTickets,
  subscribeToAllSupportTickets,
  subscribeToCustomerSupportTickets,
  subscribeToSupportMessages,
} from '@/features/support/services';

// Wallet (legacy - consumers still import from here)
export {
  getWallet,
  depositToWallet,
  deductFromWallet,
  refundToWallet,
  getWalletTransactions,
} from '@/features/wallet/services/wallet';

// Tracking
export {
  generateTrackingId,
} from '@/features/shipments/services/tracking';

// PDF generation
export {
  generateShippingLabel,
  generateWarehouseSlip,
} from '@/lib/pdf';

// User preferences
export {
  getUserPreferences,
  saveDashboardMetrics,
} from '@/features/users/services/userPreferences';

// User profile
export {
  getUserProfile,
  createUserProfile,
  updateUserProfile,
} from '@/features/users/services/userProfile';

// Quote expiry
export {
  isQuoteExpired,
  getRemainingTime,
} from '@/features/requests/services/quoteExpiry';

// Support rules
export {
  canCreateSupportTicket,
} from '@/features/support/services/supportRules';

// Quote calculator
export {
  calculateServiceFeeFromConfig,
  requiresManualQuote,
  calculateInspectionFee,
  calculateHoldFee,
} from '@/features/finance/quoteCalculator';

// Request status types
export type { RequestStatus } from '@/features/requests/services/requestStatus';
export { REQUEST_STATUS } from '@/features/requests/services/requestStatus';
export { statusLabels } from '@/features/requests/services/statusLabels';

// Dashboard metrics
export { dashboardMetrics, DEFAULT_DASHBOARD_METRICS, MIN_DASHBOARD_METRICS } from '@/features/users/services/dashboardMetrics';