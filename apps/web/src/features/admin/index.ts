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
} from './services/analytics';

export {
  getCustomersWithWallets,
  getRefundRequestDetails,
  type AdminCustomer,
} from './services/customers';

export {
  getAllRequests,
  matchesAdminRequestFilter,
  getAdminRequestPriority,
  getAdminRequestQueue,
} from './services/requestQueue';

export { useAdminWallet } from './hooks/useAdminWallet';

