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
} from "./client/analytics";

export {
  getCustomersWithWallets,
  getRefundRequestDetails,
  type AdminCustomer,
} from "./client/customersClient";

export {
  getAllRequests,
  matchesAdminRequestFilter,
  getAdminRequestPriority,
  getAdminRequestQueue,
} from "./client/requestQueueClient";

export { useAdminWallet } from "./hooks/useAdminWallet";
