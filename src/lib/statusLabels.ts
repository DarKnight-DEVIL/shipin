import { REQUEST_STATUS } from "./requestStatus";

/**
 * One label per status, used everywhere statuses are shown.
 * Sentence case keeps status columns calm and scannable.
 */
export const statusLabels = {
  [REQUEST_STATUS.submitted]: "Submitted",

  [REQUEST_STATUS.review]: "Quote ready",

  [REQUEST_STATUS.awaiting_payment]: "Awaiting payment",

  [REQUEST_STATUS.paid]: "Payment received",

  [REQUEST_STATUS.refund_offered]: "Refund offered",

  [REQUEST_STATUS.refund_requested]: "Refund requested",

  [REQUEST_STATUS.purchased]: "Purchased",

  [REQUEST_STATUS.warehouse_received]: "Warehouse received",

  [REQUEST_STATUS.ready_for_international_shipping]: "Ready to ship",

  [REQUEST_STATUS.packed]: "Packed",

  [REQUEST_STATUS.shipped]: "Shipped",

  [REQUEST_STATUS.out_for_delivery]: "Out for delivery",

  [REQUEST_STATUS.delivered]: "Delivered",

  [REQUEST_STATUS.refunded]: "Refunded",

  [REQUEST_STATUS.rejected]: "Rejected",
} as const;
