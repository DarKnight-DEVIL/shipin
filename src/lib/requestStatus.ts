export const REQUEST_STATUS = {
  submitted: "submitted",

  review: "review",

  awaiting_payment: "awaiting_payment",

  paid: "paid",

  /*
   * Customer has requested a refund and
   * admin action is required.
   *
   * This is a real request workflow status,
   * separate from refundRequest.status.
   */
  refund_requested: "refund_requested",

  /*
   * Admin/Support team has offered a refund
   * to the customer for this request.
   */
  refund_offered: "refund_offered",

  purchased: "purchased",

  warehouse_received: "warehouse_received",

  ready_for_international_shipping:
    "ready_for_international_shipping",

  packed: "packed",

  shipped: "shipped",

  out_for_delivery:
    "out_for_delivery",

  delivered: "delivered",

  refunded: "refunded",

  rejected: "rejected",
} as const;

export type RequestStatus =
  typeof REQUEST_STATUS[keyof typeof REQUEST_STATUS];