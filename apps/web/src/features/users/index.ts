/**
 * @fileoverview Users feature – barrel export.
 */

export type { UserProfile } from './services/userProfile';

export {
  getUserProfile,
  createUserProfile,
  updateUserProfile,
} from './services/userProfile';

export {
  dashboardMetrics,
  DEFAULT_DASHBOARD_METRICS,
  MIN_DASHBOARD_METRICS,
  ACTIVE_REQUEST_STATUSES,
  IN_TRANSIT_STATUSES,
} from './services/dashboardMetrics';

export type { DashboardMetricId, DashboardMetric } from './services/dashboardMetrics';

export {
  getUserPreferences,
  saveDashboardMetrics,
} from './services/userPreferences';

export type { UserPreferences } from './services/userPreferences';

export { useDashboardMetricSettings } from './hooks/useDashboardMetricSettings';
export { useDashboardOverview } from './hooks/useDashboardOverview';
export { useProfileSettings } from './hooks/useProfileSettings';


