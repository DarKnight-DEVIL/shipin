/**
 * @fileoverview Users feature – barrel export.
 */

export type { UserProfile } from "./client/userProfile";

export {
  getUserProfile,
  createUserProfile,
  updateUserProfile,
} from "./client/userProfile";

export {
  dashboardMetrics,
  DEFAULT_DASHBOARD_METRICS,
  MIN_DASHBOARD_METRICS,
  ACTIVE_REQUEST_STATUSES,
  IN_TRANSIT_STATUSES,
} from "./services/dashboardMetrics";

export type {
  DashboardMetricId,
  DashboardMetric,
} from "./services/dashboardMetrics";

export {
  getUserPreferences,
  saveDashboardMetrics,
} from "./client/userPreferences";

export type { UserPreferences } from "./client/userPreferences";

export { useDashboardMetricSettings } from "./hooks/useDashboardMetricSettings";
export { useDashboardOverview } from "./hooks/useDashboardOverview";
export { useProfileSettings } from "./hooks/useProfileSettings";
