import { REQUEST_STATUS } from './requestStatus';
import { statusLabels } from './statusLabels';

/**
 * Filter configuration for the requests list page.
 * Shared between the page and any component that needs the same filter set.
 */

/** Human-readable titles for each status filter. */
export const filterTitles: Record<string, string> = {
  [REQUEST_STATUS.submitted]: 'Submitted',
  [REQUEST_STATUS.review]: 'Quote ready',
  [REQUEST_STATUS.awaiting_payment]: 'Awaiting payment',
  [REQUEST_STATUS.paid]: 'Payment received',
  [REQUEST_STATUS.refund_offered]: 'Refund offered',
  [REQUEST_STATUS.refund_requested]: 'Refund requested',
  [REQUEST_STATUS.purchased]: 'Purchased',
  [REQUEST_STATUS.warehouse_received]: 'Warehouse received',
  [REQUEST_STATUS.ready_for_international_shipping]: 'Ready to ship',
  [REQUEST_STATUS.packed]: 'Packed',
  [REQUEST_STATUS.shipped]: 'Shipped',
  [REQUEST_STATUS.out_for_delivery]: 'Out for delivery',
  [REQUEST_STATUS.delivered]: 'Delivered',
  [REQUEST_STATUS.refunded]: 'Refunded',
  [REQUEST_STATUS.rejected]: 'Rejected',
};

/** Full status filter dropdown options. */
export const filterOptions = [
  { value: '', label: 'All statuses' },
  ...Object.entries(statusLabels).map(([value, label]) => ({
    value,
    label,
  })),
];

/** Quick-chip filters shown under the page header. */
export const quickFilters = [
  { value: '', label: 'All' },
  { value: REQUEST_STATUS.review, label: 'Quote ready' },
  { value: REQUEST_STATUS.awaiting_payment, label: 'Payment due' },
  { value: REQUEST_STATUS.shipped, label: 'In transit' },
  { value: REQUEST_STATUS.delivered, label: 'Delivered' },
];

/** Derive a page title from a status filter value. */
export function resolvePageTitle(statusFilter: string | null): string {
  if (!statusFilter) return 'My requests';
  return filterTitles[statusFilter] ?? 'My requests';
}