/**
 * @fileoverview Admin feature – barrel export.
 */

export {
  getDashboardStats,
  getMonthlyRevenue,
  getStatusDistribution,
  getRecentActivity,
  getTopCustomers,
  getOperationsOverview,
  getFinancialOverview,
} from "./services/analytics";

export {
  getCustomersWithWallets,
  getRefundRequestDetails,
  type AdminCustomer,
} from "./services/customersClient";

export {
  getAllRequests,
  matchesAdminRequestFilter,
  getAdminRequestPriority,
  getAdminRequestQueue,
} from "./services/requestQueueClient";

export { useAdminWallet } from "./hooks/useAdminWallet";
