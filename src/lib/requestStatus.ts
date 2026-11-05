/**
 * Re-export barrel for request status types and constants.
 * Maintains backward compatibility for imports from '@/lib/requestStatus'.
 */

export type { RequestStatus } from '@/features/requests/services/requestStatus';
export { REQUEST_STATUS } from '@/features/requests/services/requestStatus';
export { statusLabels } from '@/features/requests/services/statusLabels';