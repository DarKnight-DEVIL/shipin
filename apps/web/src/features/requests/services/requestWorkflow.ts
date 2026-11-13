import { REQUEST_STATUS, type RequestStatus } from './requestStatus';

/**
 * Server-side workflow rules for a request.
 *
 * The admin panels render buttons, but the server is the source of truth: a
 * hand-rolled fetch (or a stale tab) must not be able to move a request into a
 * state its data cannot support.
 */

/**
 * Statuses owned by another flow.
 *
 * `paid` is written only by the PayPal capture handler, and the refund
 * statuses only by the refund routes, because each of those transitions also
 * writes payment / refund records. Letting the generic status endpoint set
 * them would create a paid request with no payment behind it.
 */
export const RESERVED_STATUSES: readonly RequestStatus[] = [
  REQUEST_STATUS.paid,
  REQUEST_STATUS.refunded,
  REQUEST_STATUS.refund_requested,
  REQUEST_STATUS.refund_offered,
] as const;

/** Operational transitions an administrator may make by hand. */
export const ADMIN_STATUS_TRANSITIONS: Readonly<
  Record<string, readonly RequestStatus[]>
> = {
  [REQUEST_STATUS.submitted]: [
    REQUEST_STATUS.review,
    REQUEST_STATUS.rejected,
  ],
  [REQUEST_STATUS.review]: [REQUEST_STATUS.rejected],
  [REQUEST_STATUS.awaiting_payment]: [REQUEST_STATUS.rejected],
  [REQUEST_STATUS.paid]: [REQUEST_STATUS.purchased],
  [REQUEST_STATUS.purchased]: [REQUEST_STATUS.warehouse_received],
  [REQUEST_STATUS.warehouse_received]: [
    REQUEST_STATUS.ready_for_international_shipping,
    REQUEST_STATUS.packed,
  ],
  [REQUEST_STATUS.ready_for_international_shipping]: [REQUEST_STATUS.packed],
  [REQUEST_STATUS.packed]: [REQUEST_STATUS.shipped],
  [REQUEST_STATUS.shipped]: [REQUEST_STATUS.out_for_delivery],
  [REQUEST_STATUS.out_for_delivery]: [REQUEST_STATUS.delivered],
  [REQUEST_STATUS.delivered]: [],
  [REQUEST_STATUS.rejected]: [],
  [REQUEST_STATUS.refunded]: [],
};

/** Customer-visible shipment progress, in order. */
export const SHIPMENT_STATUS_TRANSITIONS: Readonly<
  Record<string, readonly RequestStatus[]>
> = {
  [REQUEST_STATUS.packed]: [REQUEST_STATUS.shipped],
  [REQUEST_STATUS.shipped]: [REQUEST_STATUS.out_for_delivery],
  [REQUEST_STATUS.out_for_delivery]: [REQUEST_STATUS.delivered],
};

/** True when `to` is a legal next status for `from`. */
export function canTransition(
  map: Readonly<Record<string, readonly RequestStatus[]>>,
  from: RequestStatus,
  to: RequestStatus
): boolean {
  return (map[from] ?? []).includes(to);
}

/** Statuses where a quote may still be issued or replaced. */
export const QUOTABLE_STATUSES: readonly RequestStatus[] = [
  REQUEST_STATUS.submitted,
  REQUEST_STATUS.review,
  REQUEST_STATUS.awaiting_payment,
] as const;

/** Statuses where the customer may still accept a quote and pay. */
export const PAYABLE_STATUSES: readonly RequestStatus[] = [
  REQUEST_STATUS.review,
  REQUEST_STATUS.awaiting_payment,
] as const;

/** Statuses where the customer may ask for a refreshed quote. */
export const REQUOTABLE_STATUSES: readonly RequestStatus[] = [
  REQUEST_STATUS.review,
  REQUEST_STATUS.awaiting_payment,
] as const;

export function isOneOf(
  value: string | undefined,
  allowed: readonly RequestStatus[]
): boolean {
  return value !== undefined && (allowed as readonly string[]).includes(value);
}
