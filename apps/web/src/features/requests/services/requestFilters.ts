import { REQUEST_STATUS } from "./requestStatus";
import { statusLabels } from "./statusLabels";

/**
 * Filter configuration for the requests list page.
 * Shared between the page and any component that needs the same filter set.
 */

/**
 * Human-readable titles for each status filter.
 *
 * Deliberately the same table as statusLabels: a second copy drifted the day
 * someone renames a status, and the page title then disagreed with the badge.
 */
export const filterTitles: Record<string, string> = statusLabels;

/** Full status filter dropdown options. */
export const filterOptions = [
  { value: "", label: "All statuses" },
  ...Object.entries(statusLabels).map(([value, label]) => ({
    value,
    label,
  })),
];

/** Quick-chip filters shown under the page header. */
export const quickFilters = [
  { value: "", label: "All" },
  { value: REQUEST_STATUS.review, label: "Quote ready" },
  { value: REQUEST_STATUS.awaiting_payment, label: "Payment due" },
  { value: REQUEST_STATUS.shipped, label: "In transit" },
  { value: REQUEST_STATUS.delivered, label: "Delivered" },
];

/** Derive a page title from a status filter value. */
export function resolvePageTitle(statusFilter: string | null): string {
  if (!statusFilter) return "My requests";
  return filterTitles[statusFilter] ?? "My requests";
}
